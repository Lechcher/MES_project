-- =============================================================================
-- SYSTEM DATABASE SCHEMA (PostgreSQL)
-- Architecture: Modular App-based (Odoo-like Architecture)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- 1. ENUMS & CONSTANTS
-- -----------------------------------------------------------------------------

-- Global State Codes cho Ticket
CREATE TYPE ticket_state_enum AS ENUM (
    'REQ',       -- Requested (Giao việc / Chưa xác nhận)
    'ACT',       -- Active (Đang làm / Đang thực hiện)
    'PEN',       -- Pending (Chờ xét duyệt / Chờ nghiệm thu)
    'APP',       -- Approved (Đã hoàn thành / Đã duyệt)
    'REJ',       -- Rejected (Cần sửa đổi / Trả về)
    'CAN',       -- Cancelled (Đã hủy)
    'OVERDUE'    -- Overdue / Expired (Quá hạn)
);

-- Global Leave Codes cho Đơn xin nghỉ / Chấm công
CREATE TYPE leave_code_enum AS ENUM (
    'AL',        -- Annual Leave (Nghỉ phép năm)
    'UAL',       -- Unapproved Annual Leave (Nghỉ phép không duyệt / Tự ý nghỉ)
    'SL',        -- Sick Leave (Nghỉ ốm)
    'USL',       -- Unexcused Sick Leave (Nghỉ ốm không đơn/lý do)
    'PL',        -- Personal Leave (Nghỉ việc riêng)
    'ML',        -- Medical / Maternity Leave (Nghỉ thai sản/điều trị dài hạn)
    'CL',        -- Compassionate Leave (Nghỉ hiếu hỉ)
    'EL',        -- Emergency Leave (Nghỉ khẩn cấp)
    'LWP',       -- Leave Without Pay (Nghỉ không lương)
    'TOIL',      -- Time Off In Lieu (Nghỉ bù OT)
    'VTO'        -- Voluntary Time Off (Nghỉ tự nguyện)
);

-- Ticket Priority Levels
CREATE TYPE priority_enum AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- Ticket Type
CREATE TYPE task_type_enum AS ENUM ('HOURLY', 'DAILY', 'MULTI_DAY');

-- -----------------------------------------------------------------------------
-- 2. APP 4: SETTINGS & IAM (User, Org Structure & RBAC)
-- -----------------------------------------------------------------------------

-- Bảng Phòng Ban / Ban Ngành
CREATE TABLE departments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(20) UNIQUE NOT NULL,         -- Ví dụ: B-SX, B-KT, B-QC
    name VARCHAR(100) NOT NULL,              -- Tên Ban / Ngành
    manager_id UUID,                         -- ID Trưởng ban (Foreign key)
    auto_forking_enabled BOOLEAN DEFAULT TRUE,-- Cấu hình nhân bản ticket tự động
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Bảng Người Dùng / Nhân Sự
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_code VARCHAR(20) UNIQUE NOT NULL,    -- Mã NV (Ví dụ: NV001)
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT TRUE,
    annual_leave_quota NUMERIC(4, 1) DEFAULT 12.0, -- Quỹ phép năm (AL)
    toil_quota NUMERIC(4, 1) DEFAULT 0.0,         -- Quỹ nghỉ bù (TOIL)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Thêm Foreign Key manager_id cho Bảng departments
ALTER TABLE departments 
ADD CONSTRAINT fk_department_manager 
FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL;

-- Bảng Vai Trò Người Dùng (RBAC Roles)
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,         -- SUPER_ADMIN, TECH_LEAD, HR_MANAGER, DEPT_HEAD, EMPLOYEE
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Bảng Mapping User - Role (N-N)
CREATE TABLE user_roles (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

-- Bảng Quyền Hạn Chi Tiết (Permissions)
CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(100) UNIQUE NOT NULL,        -- Ví dụ: ticket:create, ticket:approve, kpi:export_general
    module VARCHAR(50) NOT NULL,              -- jobs, planning, performance, settings
    description TEXT
);

-- Bảng Mapping Role - Permission (N-N)
CREATE TABLE role_permissions (
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- Bảng Log Kiểm Toán Hệ Thống (Audit Logs)
CREATE TABLE system_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,            -- USER_LOCK, PERMISSION_CHANGE, TASK_CANCEL
    resource_type VARCHAR(50) NOT NULL,      -- USER, TASK, LEAVE
    resource_id VARCHAR(100),
    old_data JSONB,
    new_data JSONB,
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- 3. APP 1: JOBS & PROJECTS (Task & Progress Tracking)
-- -----------------------------------------------------------------------------

-- Bảng Dự Án / Chiến Dịch
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    department_id UUID REFERENCES departments(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Bảng Task / Ticket
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_code VARCHAR(30) UNIQUE NOT NULL,   -- Mã Ticket
    title VARCHAR(255) NOT NULL,
    description TEXT,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    task_type task_type_enum NOT NULL DEFAULT 'DAILY',
    priority priority_enum NOT NULL DEFAULT 'MEDIUM',
    state ticket_state_enum NOT NULL DEFAULT 'REQ',
    
    -- Phân bổ & Đảm nhận
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL, -- Dùng cho Auto-forking
    
    -- Thời gian
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,       -- Deadline / Expiration
    extended_deadline TIMESTAMP WITH TIME ZONE, -- Deadline sau khi xin gia hạn
    
    -- Tiến độ (Multi-day Task: 0 -> 100%)
    progress_percentage INT DEFAULT 0 CHECK (progress_percentage BETWEEN 0 AND 100),
    
    -- Cờ trạng thái & Cảnh báo
    is_urgent_hourly BOOLEAN DEFAULT FALSE,  -- Đang xử lý gấp
    is_extension_requested BOOLEAN DEFAULT FALSE, -- Chờ duyệt gia hạn
    is_overdue BOOLEAN DEFAULT FALSE,        -- Cảnh báo OVERDUE
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Bảng Nhật Ký Cập Nhật Tiến Độ & File Báo Cáo
CREATE TABLE task_progress_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    previous_percentage INT DEFAULT 0,
    new_percentage INT NOT NULL,
    log_comment TEXT,
    attachment_urls JSONB,                  -- Lưu danh sách link file (.docx, .pdf, .zip,...)
    is_verified_by_manager BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Bảng Yêu Cầu Xin Gia Hạn / Giải Trình Nộp Trễ
CREATE TABLE task_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    request_type VARCHAR(30) NOT NULL,       -- 'EXTENSION' hoặc 'LATE_EXPLANATION'
    requested_deadline TIMESTAMP WITH TIME ZONE,
    reason TEXT NOT NULL,
    attachment_urls JSONB,
    status VARCHAR(20) DEFAULT 'PENDING',    -- PENDING, APPROVED, REJECTED
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    review_comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- 4. APP 2: PLANNING & ATTENDANCE (Calendar & Leave Management)
-- -----------------------------------------------------------------------------

-- Bảng Đơn Xin Nghỉ Phép / Nghỉ Việc
CREATE TABLE leave_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    leave_code leave_code_enum NOT NULL,      -- AL, SL, PL, UAL, USL,...
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    total_days NUMERIC(4, 1) NOT NULL,
    reason TEXT NOT NULL,
    attachment_urls JSONB,                  -- Giấy bác sĩ (SL), Giấy mời (PL),...
    handover_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    status VARCHAR(20) DEFAULT 'PENDING',    -- PENDING, APPROVED, REJECTED
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Bảng Dữ Liệu Chấm Công Hàng Ngày (Attendance Records)
CREATE TABLE attendance_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    work_date DATE NOT NULL,
    check_in TIMESTAMP WITH TIME ZONE,
    check_out TIMESTAMP WITH TIME ZONE,
    is_late BOOLEAN DEFAULT FALSE,
    is_early_leave BOOLEAN DEFAULT FALSE,
    leave_code leave_code_enum,             -- Đăng ký nghỉ (AL, SL, PL) hoặc nghỉ phạt (UAL, USL)
    working_hours NUMERIC(4, 2) DEFAULT 0.0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, work_date)
);

-- -----------------------------------------------------------------------------
-- 5. APP 3: PERFORMANCE & AUDIT (Deterministic KPI Engine)
-- -----------------------------------------------------------------------------

-- Bảng Tổng Hợp KPI Hàng Tháng Cá Nhân
CREATE TABLE kpi_monthly_summaries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    period_month INT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
    period_year INT NOT NULL,
    
    -- Thống kê công việc
    total_tasks_assigned INT DEFAULT 0,
    completed_on_time INT DEFAULT 0,         -- +10 điểm / task
    completed_urgent_on_time INT DEFAULT 0,  -- +20 điểm / task
    approved_first_time INT DEFAULT 0,       -- +5 điểm / task
    overdue_tasks INT DEFAULT 0,             -- -15 điểm / task
    rejected_tasks INT DEFAULT 0,            -- -5 điểm / task
    extension_requests_count INT DEFAULT 0,  -- -2 điểm / lần
    
    -- Thống kê chuyên cần & nghỉ
    attendance_rate NUMERIC(5, 2) DEFAULT 0.0, -- % Chuyên cần
    perfect_attendance_bonus INT DEFAULT 0,  -- +50 điểm nếu 100% chuyên cần
    unapproved_leave_count INT DEFAULT 0,    -- UAL, USL: -10 điểm / lần
    late_early_count INT DEFAULT 0,          -- Đi muộn / Về sớm: -10 điểm / lần
    
    -- Tổng điểm định lượng (Deterministic Output)
    total_kpi_score INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, period_month, period_year)
);

-- -----------------------------------------------------------------------------
-- 6. INDEXES TO OPTIMIZE PERFORMANCE
-- -----------------------------------------------------------------------------

CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_state ON tasks(state);
CREATE INDEX idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX idx_attendance_user_date ON attendance_records(user_id, work_date);
CREATE INDEX idx_kpi_summary_user_period ON kpi_monthly_summaries(user_id, period_year, period_month);