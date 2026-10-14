Tài liệu được cấu trúc hoàn toàn theo **Kiến trúc Mô-đun hóa (Modular App-Based Engine - tương tự Odoo)**, tích hợp sẵn cơ chế **Phân quyền 2 Lớp (App-Level & View/Action-Level)** để quyết định chính xác giao diện hiển thị cho từng Vai trò (Nhân viên, Trưởng ban, HR, Quản lý/Admin).

---

# TÀI LIỆU HỆ THỐNG MÔ-ĐUN HÓA ĐỒNG NHẤT (ODOO-LIKE ARCHITECTURE)

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        CORE BASE MODULE (System)                       │
│  - User Directory, RBAC & Permission Matrix Engine                     │
│  - Telegram Webhook Notification Engine                                 │
│  - Deterministic Performance Calculation Engine (KPIs)                 │
│  - Global State Codes (REQ, ACT, PEN, APP, REJ, CAN, OVERDUE)          │
│  - Global Leave Codes (AL, UAL, SL, USL, PL, ML, CL, EL, LWP, TOIL, VTO)│
└───────────┬───────────────────┬───────────────────┬────────────────────┘
            │                   │                   │
    ┌───────┴───────┐   ┌───────┴───────┐   ┌───────┴───────┐   ┌───────┴───────┐
    │  App 1: Jobs  │   │App 2: Planning│   │App 3: Perform │   │App 4: Settings│
    │  & Projects   │   │  & Attendance │   │  & KPI Audit  │   │    & IAM      │
    └───────────────┘   └───────────────┘   └───────────────┘   └───────────────┘

```

---

## 📋 BẢNG MÃ CHUẨN HÓA DÙNG CHUNG TOÀN HỆ THỐNG

### 1. Bảng Mã Trạng Thái Ticket (Ticket State Codes & Color Codes)

| Mã State Code | Tên Trạng Thái | Mã Màu Nhận Diện | Điều Kiện & Kích Hoạt Trạng Thái |
| --- | --- | --- | --- |
| **REQ** | **Requested** *(Giao việc / Chưa xác nhận)* | ⚪ **Màu Trắng** | Ticket mới phân bổ hoặc nhân viên chưa xác nhận / chưa lập kế hoạch trước 08:30. |
| **ACT** | **Active** *(Đang làm / Đang thực hiện)* | 🟡 **Màu Vàng** | Nhân viên đã nhận việc và đang xử lý.<br>

<br>• *Badge phụ:* `ACT - Xử lý gấp` | `ACT - Cập nhật tiến độ (X%)` | `ACT - Chờ duyệt gia hạn` | `ACT - Chờ xác minh tiến độ`. |
| **PEN** | **Pending** *(Chờ xét duyệt / Chờ nghiệm thu)* | 🔵 **Màu Xanh Dương** | Bấm Hoàn thành hoặc Tiến độ việc dài ngày đạt 100% + Nộp file nghiệm thu & báo cáo. |
| **APP** | **Approved** *(Đã hoàn thành / Đã duyệt)* | 🟢 **Màu Xanh Lá** | Quản lý/HR đã bấm phê duyệt báo cáo kết quả / nghiệm thu tiến độ thành công. |
| **REJ** | **Rejected** *(Cần sửa đổi / Trả về)* | 🟠 **Màu Cam** | Bị Quản lý/HR bác bỏ báo cáo hoặc trả lại % tiến độ (yêu cầu chỉnh sửa/làm lại). |
| **CAN** | **Cancelled** *(Đã hủy)* | 🔴 **Màu Đỏ** | Ticket bị hủy bỏ bởi Nhân viên hoặc Quản lý (Bắt buộc nhập lý do). |
| **OVERDUE** | **Overdue / Expired** *(Quá hạn / Hết hạn)* | 🔴 **Màu Đỏ (Cảnh báo)** | Quá mốc giờ việc gấp, qua 00:00 ngày mới việc theo ngày, hoặc qua 00:00 liền sau `End_Date` mà tiến độ $< 100\%$. |

---

### 2. Bảng Mã Trạng Thái Nghỉ Phép / Nghỉ Việc (Leave State Codes)

| Mã Leave Code | Tên Tiếng Anh | Tên Tiếng Việt / Giải Thích | Quy Chuẩn Lương & Chấm Công |
| --- | --- | --- | --- |
| **AL** | Annual Leave | Nghỉ phép năm (Có hưởng lương) | Hưởng 100% lương |
| **UAL** | Unapproved / Unpaid Annual Leave | Nghỉ phép năm không duyệt / Tự ý nghỉ | Trừ 100% lương ngày + Trừ điểm KPI |
| **SL** | Sick Leave | Nghỉ ốm / Nghỉ bệnh (Có đơn bác sĩ/BHXH) | Hưởng chế độ BHXH / Lương bệnh |
| **USL** | Unexcused / Unpaid Sick Leave | Nghỉ ốm không lý do / Không đơn | Trừ 100% lương ngày + Trừ điểm KPI |
| **PL** | Personal Leave | Nghỉ việc riêng (Kết hôn, tang chế) | Hưởng 100% lương theo Luật Lao động |
| **ML** | Medical / Maternity Leave | Nghỉ thai sản / Điều trị y tế dài hạn | Hưởng chế độ BHXH thai sản/y tế |
| **CL** | Compassionate Leave | Nghỉ hiếu hỉ / Sự cố gia cảnh đặc biệt | Hưởng lương hoặc không lương tùy policy |
| **EL** | Emergency Leave | Nghỉ khẩn cấp (Thiên tai, tai nạn) | Được ưu tiên xét duyệt bổ sung sau |
| **LWP** | Leave Without Pay | Nghỉ không hưởng lương (Đã thỏa thuận) | Không tính lương ngày, không phạt |
| **TOIL** | Time Off In Lieu | Nghỉ bù (Dùng quỹ giờ làm thêm OT) | Hưởng 100% lương (trừ quỹ giờ OT) |
| **VTO** | Voluntary Time Off | Nghỉ tự nguyện (Công ty ít việc) | Không lương / Hỗ trợ tùy chính sách |

---

## 🔐 CƠ CHẾ PHÂN QUYỀN VÀ HIỂN THỊ GIAO DIỆN (RBAC & UI RENDERING)

Hệ thống quản lý quyền truy cập qua **2 Lớp Kiểm soát**:

1. **Lớp 1 — App-Level Access Guard:** Quyết định Icon App nào xuất hiện trên Home Page Dashboard khi đăng nhập.


2. **Lớp 2 — View & Action-Level Access Guard:** Quyết định tab, cột dữ liệu, nút thao tác và nút In/Xuất báo cáo nào được render bên trong từng App.

### Bảng Kiểm Soát Quyền Truy Cập Chi Tiết (Permission Matrix Engine)

| Chức Năng & Quyền Thao Tác | Super Admin | Manager / Tech Lead | HR Manager | Trưởng Ban | Nhân Viên (Employee) |
| --- | --- | --- | --- | --- | --- |
| **App Jobs & Projects (`Jobs`)**<br> | ✅ (Toàn bộ) | ✅ (Toàn bộ) | ✅ (Toàn công ty) | ✅ (Nội bộ Ban) | ✅ (Chi tiết Cá nhân) |
| • *Tạo mới / Phân bổ Ticket (⚪ REQ)* | ✅ | ✅ | ✅ | ✅ | ❌ |
| • *Nhận việc (🟡 ACT) & Báo cáo (🔵 PEN)* | ✅ | ✅ | ✅ | ✅ | ✅ |
| • *Duyệt nghiệm thu (🟢 APP) / Trả về (🟠 REJ)* | ✅ | ✅ | ✅ | ✅ | ❌ |
| • *Xin gia hạn / Giải trình nộp trễ* | ✅ | ✅ | ✅ | ✅ | ✅ |
| • *In phiếu Ticket / Xuất Task Excel* | ✅ | ✅ | ✅ | ✅ | ✅ (Chỉ Task cá nhân) |
| **App Planning & Attendance (`Planning`)**<br> | ✅ (Toàn bộ) | ✅ (Toàn bộ) | ✅ (Toàn công ty) | ✅ (Nội bộ Ban) | ✅ (Chi tiết Cá nhân) |
| • *Xem Lịch Ma trận Chấm công (Monthly View)* | Toàn Cty | Toàn Cty | Toàn Cty | Nội bộ Ban | Lịch Cá nhân |
| • *Duyệt Đơn xin nghỉ / Duyệt công việc* | ✅ | ✅ | ✅ | ✅ | ❌ |
| • *Gán mã Nghỉ Không Phép (🔴 UAL, USL)* | ✅ | ❌ | ✅ | ❌ | ❌ |
| • *Đăng ký Nghỉ phép (AL, SL, PL,...)* | ✅ | ✅ | ✅ | ✅ | ✅ |
| • *In Đơn xin nghỉ / Xuất Chấm công Excel* | ✅ | ✅ | ✅ | ✅ (Chỉ Ban) | ✅ (Chỉ Đơn cá nhân) |
| **App Performance & Audit (`Performance`)**<br> | ✅ (Toàn bộ) | ✅ (Toàn bộ) | ✅ (Toàn công ty) | ✅ (Nội bộ Ban) | ✅ (KPI Cá nhân) |
| • *Xem Dashboard KPI Cá nhân* | ✅ | ✅ | ✅ | ✅ | ✅ |
| • *Xem Audit Table Level 3 (Nhân viên trong Ban)* | ✅ | ✅ | ✅ | ✅ | ❌ |
| • *Xem Audit Table Level 1 & 2 (Toàn Cty & Ban)* | ✅ | ✅ | ✅ | ❌ | ❌ |
| • *In / Xuất Bảng tính Audit Multi-sheets Excel* | ✅ | ✅ | ✅ | ✅ (Chỉ Ban) | ✅ (Chỉ Báo cáo cá nhân) |
| **App Settings & IAM (`Settings`)**<br> | ✅ (Ẩn với NV) | ✅ (Ẩn với NV) | 🟡 (Chỉ xem User) | ❌ (Ẩn hoàn toàn) | ❌ (Ẩn hoàn toàn) |
| • *Quản lý Tài khoản (Tạo/Sửa/Reset/Lock)* | ✅ | ❌ | ✅ | ❌ | ❌ |
| • *Quản lý Phân quyền RBAC & Webhook* | ✅ | ✅ | ❌ | ❌ | ❌ |

---

## 📱 CHI TIẾT CÁC MÔ-ĐUN ỨNG DỤNG (CUSTOM APPS)

### 📱 APP 1: JOBS & PROJECTS (`Jobs`)



> **Mục đích:** Mô-đun tác nghiệp và xử lý Ticket chính của hệ thống.

#### 1. Chức năng & Luồng Vận hành:

* **Project Tracking:** Mọi ticket khởi tạo bắt buộc gắn với một **Project/Chiến dịch** cụ thể (hoặc nhóm mặc định *General Operations*).
* **Phân loại thời gian & Tiến độ:**
* **Hourly Task (Việc gấp):** Deadline theo khung giờ khẩn cấp (*10:30, 14:00, 16:30*).
* **Daily Task (Việc theo ngày):** Deadline mặc định 17h/18h cùng ngày.
* **Multi-day Task (Việc dài ngày):** Theo dõi theo % Tiến độ tích lũy ($0\% \rightarrow 100\%$) với các mốc quy chuẩn: $25\%$ (Outline/Wireframe) $\rightarrow$ $50\%$ (Draft/Thô) $\rightarrow$ $75\%$ (Testing/Review) $\rightarrow$ $100\%$ (Nghiệm thu).


* **Sơ đồ Chuyển Trạng Thái (State Transition Flow):**

$$\text{REQ (Requested)} \xrightarrow{\text{Nhận việc}} \text{ACT (Active)} \xrightarrow{\text{Nộp báo cáo}} \text{PEN (Pending)} \begin{cases} \xrightarrow{\text{Duyệt}} \text{APP (Approved)} \\ \xrightarrow{\text{Trả về}} \text{REJ (Rejected)} \end{cases}$$



*(Hủy việc: Bất kỳ lúc nào $\rightarrow$ **CAN (Cancelled)**)*
* **Quy trình Xin gia hạn (`ACT - Chờ duyệt gia hạn`):** Gửi yêu cầu trước khi quá hạn $\rightarrow$ Chọn deadline mới + Lý do + Bằng chứng $\rightarrow$ Quản lý Duyệt (Cập nhật deadline mới) hoặc Từ chối (Giữ deadline cũ).
* **Quy trình Xử lý Nộp trễ (`OVERDUE`):** Quá deadline tự động chuyển 🔴 **OVERDUE** $\rightarrow$ Khóa nút Hoàn thành $\rightarrow$ Bắt buộc bấm **`Báo cáo nộp trễ / Giải trình`** $\rightarrow$ 🔵 **PEN** (gắn tag cảnh báo *Nộp trễ*).

#### 2. Màn hình Chức năng & Hiển thị theo Vai trò:

* **Thanh điều hướng Ngày 1-Click (Header Bar):** `[ Hôm qua ]` \ `[ Hôm nay ]` \ `[ Ngày mai ]`.
* **Daily Quick-add:** Màn hình lập kế hoạch/xác nhận công việc đầu ngày (trước 08:30).
* **Giao diện Nhân viên:** Chỉ hiển thị các ticket được giao cho cá nhân; Ẩn nút tạo ticket mới phân bổ cho người khác.
* **Giao diện Quản lý / HR:** Thấy nút `+ Tạo Ticket mới` (hỗ trợ **Auto-forking Engine** nhân bản tự động về các tài khoản thuộc Ban), thấy toàn bộ ticket của Ban/Công ty và hiển thị nút `Hủy Ticket (CAN)`.

#### 3. Chức năng In & Xuất Báo cáo (Print/Export Engine):

* **[🖨️ In / Print]:** In Phiếu giao việc / Phiếu nghiệm thu ticket chuẩn PDF (kèm log thời gian và comment).
* **[📥 Xuất / Export]:** Xuất danh sách task dự án ra file Excel (`.xlsx`) hoặc CSV (`.csv`) theo bộ lọc.

---

### 📱 APP 2: PLANNING & ATTENDANCE (`Planning`)



> **Mục đích:** Mô-đun quản lý Lịch làm việc ma trận, Chấm công, Duyệt báo cáo nghiệm thu và Đăng ký Nghỉ phép.

#### 1. Chức năng & Luồng Vận hành:

* **Department Matrix Grid:** Lịch ma trận hàng là Nhân viên (nhóm theo Ban/Ngành), cột là Ngày/Giờ. Ticket hiển thị dưới dạng thanh Gantt-like bar chứa % tiến độ thực tế và Mã State Code (**REQ, ACT, PEN, APP, REJ, CAN, OVERDUE**).
* **Approval Board (Dành cho HR/Quản lý):**
* Hàng chờ duyệt công việc: Kiểm tra báo cáo ở trạng thái 🔵 **PEN** $\rightarrow$ Duyệt 🟢 **APP** (+ Điểm KPI) hoặc Trả về 🟠 **REJ** (- Điểm KPI).
* Hàng chờ duyệt gia hạn và duyệt báo cáo nộp trễ.


* **Leave Management Workflow (Quản lý Nghỉ Phép):**
* Nhân viên gửi đơn chọn mã Leave Code (**AL, SL, PL, ML, CL, EL, LWP, TOIL, VTO**) + File đính kèm + Nhân sự bàn giao.
* HR/Quản lý Duyệt $\rightarrow$ Ô ngày hiển thị Badge chính thức (**AL, SL, PL,...**).
* HR/Quản lý Từ chối / Tự ý nghỉ $\rightarrow$ Ô ngày bị gắn mã **UAL** hoặc **USL** $\rightarrow$ Trừ 100% lương ngày + Trừ 10-20 điểm KPI chuyên cần.



#### 2. Màn hình Chức năng & Hiển thị theo Vai trò:

* **Giao diện Nhân viên:** Chỉ thấy Lịch cá nhân + Badge chấm công/nghỉ phép của mình; Nút `Tạo đơn xin nghỉ`; Bị ẩn tab *Approval Board*.
* **Giao diện Trưởng ban:** Thấy Lịch ma trận toàn Ban; Xuất hiện tab *Duyệt công việc Ban* và *Duyệt đơn nghỉ phép Ban*.
* **Giao diện HR / Super Admin:** Thấy Lịch ma trận toàn Công ty (có Bộ lọc phòng ban); Xuất hiện tab *Approval Board toàn hệ thống* và chức năng gán mã nghỉ phạt (🔴 **UAL, USL**).

#### 3. Chức năng In & Xuất Báo cáo (Print/Export Engine):

* **[🖨️ In / Print]:** In Đơn xin nghỉ phép chuẩn form A4 (có chữ ký điện tử); In Lịch chấm công tháng phòng ban (A4 Landscape).
* **[📥 Xuất / Export]:** Xuất Bảng tổng hợp công & Quỹ phép còn tồn (`AL Balance`, `TOIL Balance`) ra file Excel (`.xlsx`).

---

### 📱 APP 3: PERFORMANCE & AUDIT (`Performance / Users`)



> **Mục đích:** Trung tâm đo lường, tính toán điểm số hiệu suất tự động 100% bằng Thuật toán Deterministic Engine dựa trên bộ quy tắc cố định.

#### 1. Thuật toán Tính điểm Hiệu suất Định lượng:

$$\text{Tổng Điểm Hiệu Suất} = \text{Tổng Điểm Cộng (+)} - \text{Tổng Điểm Trừ (-)}$$

* **Cộng điểm (+):** `+10 điểm`/ticket đúng hạn (**APP**) | `+20 điểm`/ticket gấp đúng hạn (**APP**) | `+5 điểm`/lần được duyệt ngay không chỉnh sửa | `+50 điểm`/tháng chuyên cần xuất sắc.
* **Trừ điểm (-):** `-15 điểm`/ticket quá hạn (🔴 **OVERDUE**) | `-5 điểm`/lần bị trả về (🟠 **REJ**) | `-2 điểm`/lần xin gia hạn | `-10 điểm`/lần đi muộn, về sớm, hoặc nghỉ không phép (**UAL/USL**).

#### 2. Hệ thống Bảng tính Audit 3 Cấp (Multi-level Audit Tables):

* **BẢNG 1: BẢNG TÍNH HIỆU SUẤT CHO TOÀN BỘ NHÂN VIÊN (GENERAL LEVEL)**
*(Hiển thị với HR / Admin — Sắp xếp theo TỔNG ĐIỂM HIỆU SUẤT giảm dần từ cao xuống thấp).*

| STT | Mã NV | Tên Nhân Viên | Ban / Ngành | Tổng CV | Đúng Hạn (APP) | Quá Hạn (OVERDUE) | Phép Năm (AL) | Nghỉ Ốm (SL) | Nghỉ Không Phép (UAL/USL) | Chuyên Cần XK (+50) | Trừ Điểm Nghỉ KP (-10/lần) | Tỷ Lệ Chuyên Cần (%) | TỔNG ĐIỂM HIỆU SUẤT |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | NV001 | Nguyễn Văn A | Ban Sản Xuất | 25 | 22 | 0 | 1 | 0 | 0 | +50 | 0 | 100% | **425** |
| 2 | NV012 | Lê Thị H | Ban Kỹ Thuật | 22 | 18 | 0 | 2 | 1 | 0 | +50 | 0 | 100% | **400** |
| 3 | NV008 | Hoàng Văn K | Ban QC | 20 | 16 | 0 | 0 | 0 | 0 | +50 | 0 | 100% | **388** |
| 4 | NV002 | Trần Thị B | Ban Sản Xuất | 20 | 18 | 1 | 1 | 0 | 1 (UAL) | 0 | -10 | 92% | **270** |
| 5 | NV015 | Đỗ Minh T | Ban Kỹ Thuật | 19 | 15 | 1 | 0 | 2 (SL) | 0 | 0 | 0 | 98% | **241** |
| 6 | NV003 | Phạm Văn D | Ban Sản Xuất | 18 | 12 | 3 | 0 | 0 | 2 (USL) | 0 | -20 | 80% | **85** |

* **BẢNG 2: BẢNG TÍNH HIỆU SUẤT THEO BAN / NGÀNH (DEPARTMENT LEVEL)**

| STT | Mã Ban | Tên Ban / Ngành | Trưởng Ban | Tổng NV | Tổng CV Được Giao | Tỷ Lệ Tiến Độ TB (%) | Tỷ Lệ Hoàn Thành Đúng Hạn (%) | Điểm Chuyên Cần TB | Điểm Hiệu Suất TB Ban |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | B-SX | Ban Sản Xuất | Nguyễn Văn C | 15 | 320 | 94.5% | 96.0% | 95/100 | **245.5** |
| 2 | B-KT | Ban Kỹ Thuật | Trần Văn D | 8 | 180 | 91.0% | 92.5% | 98/100 | **210.0** |
| 3 | B-QC | Ban Kiểm Hàng (QC) | Lê Thị E | 6 | 140 | 88.0% | 89.0% | 92/100 | **185.0** |

* **BẢNG 3: BẢNG TÍNH HIỆU SUẤT TỪNG NHÂN VIÊN TRONG BAN (EMPLOYEE LEVEL)**
*(Hiển thị với Trưởng ban để theo dõi nội bộ phòng ban).*

| STT | Mã NV | Tên Nhân Viên | Tổng CV | Đúng Hạn (APP) | Quá Hạn (OVERDUE) | Phép Năm (AL) | Nghỉ Không Phép (UAL/USL) | Duyệt Ngay (+5) | Chuyên Cần XK (+50) | Trả Về (-5) | Tỷ Lệ Chuyên Cần (%) | TỔNG ĐIỂM HIỆU SUẤT |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | NV001 | Nguyễn Văn A | 25 | 22 | 0 | 1 | 0 | 20 | +50 | 1 | 100% | **425** |
| 2 | NV002 | Trần Thị B | 20 | 18 | 1 | 1 | 1 (UAL) | 15 | 0 | 2 | 92% | **270** |
| 3 | NV003 | Phạm Văn D | 18 | 12 | 3 | 0 | 2 (USL) | 8 | 0 | 4 | 80% | **85** |

#### 3. Màn hình Chức năng & Hiển thị theo Vai trò:

* **Giao diện Nhân viên:** Chỉ hiển thị **Dashboard KPI Cá nhân** (Thẻ điểm, Biểu đồ Donut Chart cá nhân, Quỹ phép **AL/TOIL Balance** của mình). Bị ẩn toàn bộ Bảng tính Audit Level 1 & 2.
* **Giao diện Trưởng ban:** Hiển thị Dashboard KPI cá nhân + **Bảng tính Level 3 (Employee Level)** của Ban mình.
* **Giao diện HR / Admin:** Hiển thị đầy đủ **Bảng tính Audit 3 Cấp** và Biểu đồ cột dọc xếp hạng toàn công ty.

#### 4. Chức năng In & Xuất Báo cáo (Print/Export Engine):

* **[🖨️ In / Print]:** In Báo cáo Đánh giá KPI Cá nhân chuẩn A4.
* **[📥 Xuất / Export]:** Xuất file Excel (`.xlsx`) chứa trọn vẹn 3 Sheet Bảng tính Audit (General, Department, Employee) và xuất Biểu đồ cột dọc xếp hạng hiệu suất.

---

### 📱 APP 4: SETTINGS & IAM (`Settings`)



> **Mục đích:** Trung tâm quản trị hệ thống, phân quyền RBAC, quản lý tổ chức và cấu hình kết nối Webhook.

#### 1. Các Chức năng Quản trị Core:

* **User Directory:** Quản lý tài khoản (Xem, Tạo mới, Sửa, Reset Password, Soft Delete).
* **Org Structure Management:** Quản lý Ban/Ngành, cấu hình cơ chế **Auto-forking Engine**.
* **System Audit Logs:** Lưu vết toàn bộ lịch sử can thiệp kỹ thuật (User, Action, Field Changes, Timestamp, IP Address).
* **Telegram Webhook Settings:** Cấu hình Bot Telegram, Chat ID nhóm alert và Webhook URL endpoints.

#### 2. Màn hình Chức năng & Hiển thị theo Vai trò:

* **Nhân viên & Trưởng ban:** Icon App bị ẩn hoàn toàn trên Home Page Dashboard.


* **HR Manager:** Thấy menu *User Directory* để quản lý nhân sự; Bị ẩn menu RBAC và Webhook.
* **Technical Lead / Super Admin:** Hiển thị 100% đầy đủ tất cả menu cấu hình kỹ thuật.

---

## 🚀 KHẢ NĂNG MỞ RỘNG MÔ-ĐUN TRONG TƯƠNG LAI (FUTURE EXPANSION)

Nhờ thiết kế mô-đun hóa hạt nhân giống Odoo, khi hệ thống mở rộng, các App mới sẽ được nhúng trực tiếp vào Home Page Dashboard:

1. **App Recruitment (`Recruitment`):** Quản lý quy trình tuyển dụng, tự động tạo tài khoản bên App `Settings` khi ứng viên trúng tuyển.


2. **App Payroll (`Payroll`):** Đọc dữ liệu chấm công từ App `Planning` + Điểm KPI từ App `Performance` để tự động tính và xuất bảng lương hàng tháng.


3. **App Inventory / Asset (`Assets`):** Quản lý cấp phát máy móc, thiết bị kỹ thuật cho nhân sự.