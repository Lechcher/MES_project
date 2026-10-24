"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { PaginationBar } from "@/components/shared/pagination-bar";
import {
  EmptyState,
  ErrorState,
  InlineAlert,
  LoadingState,
} from "@/components/shared/query-states";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useErrorText } from "@/lib/mes/i18n/error-text";
import { useDomainLabels } from "@/lib/mes/i18n/labels";
import { ROLE_CODES } from "@/lib/mes/queries/access";
import { DEPARTMENTS_QUERY } from "@/lib/mes/queries/common";
import {
  CREATE_USER_MUTATION,
  DEACTIVATE_USER_MUTATION,
  RESET_USER_PASSWORD_MUTATION,
  UPDATE_USER_MUTATION,
  USERS_QUERY,
} from "@/lib/mes/queries/settings";
import type {
  Connection,
  DepartmentDetail,
  RoleCode,
  UserRef,
} from "@/lib/mes/queries/types";
import { useApiQuery } from "@/lib/mes/queries/use-api";
import { useMutation } from "@/lib/mes/session";

const PAGE_LIMIT = 20;

interface UserDraft {
  userCode: string;
  fullName: string;
  email: string;
  password: string;
  departmentId: string;
  roleCode: RoleCode;
  isActive: boolean;
}

const EMPTY_DRAFT: UserDraft = {
  userCode: "",
  fullName: "",
  email: "",
  password: "",
  departmentId: "",
  roleCode: "EMPLOYEE",
  isActive: true,
};

/**
 * User Directory — searchable, filterable, with Create, Edit, Reset Password,
 * and Deactivate (soft lock). Every management action appends an audit entry
 * server-side.
 */
export function UserDirectory() {
  const t = useTranslations("settings.users");
  const tCommon = useTranslations("common");
  const labels = useDomainLabels();
  // Localized role names for the Select `items` maps, keyed by code.
  const ROLE_ITEMS = Object.fromEntries(
    ROLE_CODES.map((code) => [code, labels.role(code)]),
  );
  const [searchInput, setSearchInput] = useState("");
  const errorText = useErrorText();
  const [departmentId, setDepartmentId] = useState("ALL");
  const [roleCode, setRoleCode] = useState("ALL");
  const [activeFilter, setActiveFilter] = useState("ALL");
  const [offset, setOffset] = useState(0);

  const [editing, setEditing] = useState<UserRef | null>(null);
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState<UserRef | null>(null);
  const [deactivating, setDeactivating] = useState<UserRef | null>(null);
  const [draft, setDraft] = useState<UserDraft>(EMPTY_DRAFT);
  const [newPassword, setNewPassword] = useState("");
  const [feedback, setFeedback] = useState<{
    tone: "error" | "success";
    message: string;
  } | null>(null);

  const createUser = useMutation<unknown>(CREATE_USER_MUTATION);
  const updateUser = useMutation<unknown>(UPDATE_USER_MUTATION);
  const resetPassword = useMutation<unknown>(RESET_USER_PASSWORD_MUTATION);
  const deactivateUser = useMutation<unknown>(DEACTIVATE_USER_MUTATION);

  const filter = {
    search: searchInput.trim() || undefined,
    departmentId: departmentId === "ALL" ? undefined : departmentId,
    roleCode: roleCode === "ALL" ? undefined : roleCode,
    isActive: activeFilter === "ALL" ? undefined : activeFilter === "ACTIVE",
  };

  const usersQuery = useApiQuery<{ users: Connection<UserRef> }>(
    USERS_QUERY,
    {
      filter,
      offset,
      limit: PAGE_LIMIT,
    },
    { liveArea: "users" },
  );
  const departmentsQuery = useApiQuery<{ departments: DepartmentDetail[] }>(
    DEPARTMENTS_QUERY,
    {},
    { liveArea: "users" },
  );

  const users = usersQuery.data?.users.nodes ?? [];
  const departments = departmentsQuery.data?.departments ?? [];

  const openCreate = () => {
    setDraft(EMPTY_DRAFT);
    setFeedback(null);
    setCreating(true);
  };

  const openEdit = (user: UserRef) => {
    setDraft({
      userCode: user.userCode,
      fullName: user.fullName,
      email: user.email,
      password: "",
      departmentId: user.department?.id ?? "",
      roleCode: (user.roles?.[0]?.code ?? "EMPLOYEE") as RoleCode,
      isActive: user.isActive !== false,
    });
    setFeedback(null);
    setEditing(user);
  };

  const submitCreate = async () => {
    setFeedback(null);
    try {
      await createUser.run({
        input: {
          userCode: draft.userCode.trim(),
          fullName: draft.fullName.trim(),
          email: draft.email.trim(),
          password: draft.password,
          departmentId: draft.departmentId || undefined,
          roleCodes: [draft.roleCode],
        },
      });
      setCreating(false);
      setFeedback({
        tone: "success",
        message: t("created"),
      });
      usersQuery.refetch();
    } catch (cause) {
      setFeedback({
        tone: "error",
        message: errorText(cause),
      });
    }
  };

  const submitEdit = async () => {
    if (!editing) return;
    setFeedback(null);
    try {
      await updateUser.run({
        input: {
          id: editing.id,
          fullName: draft.fullName.trim(),
          email: draft.email.trim(),
          departmentId: draft.departmentId || undefined,
          roleCodes: [draft.roleCode],
          isActive: draft.isActive,
        },
      });
      setEditing(null);
      setFeedback({
        tone: "success",
        message: t("updated"),
      });
      usersQuery.refetch();
    } catch (cause) {
      setFeedback({
        tone: "error",
        message: errorText(cause),
      });
    }
  };

  const submitReset = async () => {
    if (!resetting) return;
    setFeedback(null);
    try {
      await resetPassword.run({
        userId: resetting.id,
        newPassword,
      });
      setResetting(null);
      setNewPassword("");
      setFeedback({
        tone: "success",
        message: t("passwordReset"),
      });
    } catch (cause) {
      setFeedback({
        tone: "error",
        message: errorText(cause),
      });
    }
  };

  const submitDeactivate = async () => {
    if (!deactivating) return;
    setFeedback(null);
    try {
      await deactivateUser.run({ userId: deactivating.id });
      setDeactivating(null);
      setFeedback({
        tone: "success",
        message: t("deactivated"),
      });
      usersQuery.refetch();
    } catch (cause) {
      setFeedback({
        tone: "error",
        message: errorText(cause),
      });
    }
  };

  const draftFields = (
    <>
      <div className="grid gap-1">
        <Label htmlFor="user-code">{t("fieldUserCode")}</Label>
        <Input
          id="user-code"
          value={draft.userCode}
          disabled={editing !== null}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              userCode: event.target.value,
            }))
          }
        />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="user-name">{t("fieldFullName")}</Label>
        <Input
          id="user-name"
          value={draft.fullName}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              fullName: event.target.value,
            }))
          }
        />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="user-email">{t("fieldEmail")}</Label>
        <Input
          id="user-email"
          type="email"
          value={draft.email}
          onChange={(event) =>
            setDraft((current) => ({ ...current, email: event.target.value }))
          }
        />
      </div>
      {editing === null ? (
        <div className="grid gap-1">
          <Label htmlFor="user-password">{t("fieldInitialPassword")}</Label>
          <Input
            id="user-password"
            type="password"
            value={draft.password}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                password: event.target.value,
              }))
            }
          />
        </div>
      ) : null}
      <div className="grid gap-1">
        <Label htmlFor="user-department">{t("fieldDepartment")}</Label>
        <Select
          value={draft.departmentId || "NONE"}
          onValueChange={(value) =>
            setDraft((current) => ({
              ...current,
              departmentId: !value || value === "NONE" ? "" : value,
            }))
          }
        >
          <SelectTrigger id="user-department" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="NONE">{t("noDepartment")}</SelectItem>
            {departments.map((department) => (
              <SelectItem key={department.id} value={department.id}>
                {department.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1">
        <Label htmlFor="user-role">{t("fieldRole")}</Label>
        <Select
          value={draft.roleCode}
          onValueChange={(value) =>
            setDraft((current) => ({ ...current, roleCode: value as RoleCode }))
          }
          items={ROLE_ITEMS}
        >
          <SelectTrigger id="user-role" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLE_CODES.map((code) => (
              <SelectItem key={code} value={code}>
                {labels.role(code)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {editing ? (
        <div className="flex items-center gap-3">
          <Switch
            id="user-active"
            checked={draft.isActive}
            onCheckedChange={(checked) =>
              setDraft((current) => ({ ...current, isActive: checked }))
            }
          />
          <Label htmlFor="user-active">{t("fieldActive")}</Label>
        </div>
      ) : null}
    </>
  );

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{t("title")}</h2>
          <p className="text-xs text-muted-foreground">{t("description")}</p>
        </div>
        <Button size="sm" onClick={openCreate}>
          {t("create")}
        </Button>
      </div>

      <div className="grid gap-3 border border-border p-4 md:grid-cols-4">
        <div className="grid gap-1">
          <Label htmlFor="dir-search">{t("searchLabel")}</Label>
          <Input
            id="dir-search"
            value={searchInput}
            placeholder={t("searchPlaceholder")}
            onChange={(event) => {
              setSearchInput(event.target.value);
              setOffset(0);
            }}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="dir-department">{t("departmentLabel")}</Label>
          <Select
            value={departmentId}
            onValueChange={(value) => {
              setDepartmentId(value ?? "ALL");
              setOffset(0);
            }}
            items={{
              ALL: t("allDepartments"),
              ...Object.fromEntries(
                departments.map((department) => [
                  department.id,
                  department.name,
                ]),
              ),
            }}
          >
            <SelectTrigger id="dir-department" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t("allDepartments")}</SelectItem>
              {departments.map((department) => (
                <SelectItem key={department.id} value={department.id}>
                  {department.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="dir-role">{t("roleLabel")}</Label>
          <Select
            value={roleCode}
            onValueChange={(value) => {
              setRoleCode(value ?? "ALL");
              setOffset(0);
            }}
            items={{ ALL: t("allRoles"), ...ROLE_ITEMS }}
          >
            <SelectTrigger id="dir-role" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t("allRoles")}</SelectItem>
              {ROLE_CODES.map((code) => (
                <SelectItem key={code} value={code}>
                  {labels.role(code)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="dir-active">{t("activeLabel")}</Label>
          <Select
            value={activeFilter}
            onValueChange={(value) => {
              setActiveFilter(value ?? "ALL");
              setOffset(0);
            }}
            items={{
              ALL: t("allStatuses"),
              ACTIVE: t("active"),
              INACTIVE: t("inactive"),
            }}
          >
            <SelectTrigger id="dir-active" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t("all")}</SelectItem>
              <SelectItem value="ACTIVE">{t("active")}</SelectItem>
              <SelectItem value="INACTIVE">{t("inactive")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {feedback ? (
        <InlineAlert tone={feedback.tone}>{feedback.message}</InlineAlert>
      ) : null}
      {usersQuery.error ? (
        <ErrorState error={usersQuery.error} onRetry={usersQuery.refetch} />
      ) : null}
      {usersQuery.loading && !usersQuery.data ? (
        <LoadingState label={t("loading")} rows={5} />
      ) : null}

      {usersQuery.data && users.length === 0 ? (
        <EmptyState
          title={t("emptyTitle")}
          description={t("emptyDescription")}
        />
      ) : null}

      {users.length > 0 ? (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colName")}</TableHead>
                <TableHead>{t("colEmail")}</TableHead>
                <TableHead className="w-40">{t("colDepartment")}</TableHead>
                <TableHead className="w-32">{t("colRole")}</TableHead>
                <TableHead className="w-20">{t("colActive")}</TableHead>
                <TableHead className="w-64">{t("colActions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="text-sm">{user.fullName}</TableCell>
                  <TableCell className="text-xs">{user.email}</TableCell>
                  <TableCell className="text-xs">
                    {user.department?.name ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {(user.roles ?? [])
                      .map((role) => labels.role(role.code))
                      .join(", ") || "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {user.isActive === false ? t("no") : t("yes")}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => openEdit(user)}
                      >
                        {t("edit")}
                      </Button>
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => {
                          setNewPassword("");
                          setFeedback(null);
                          setResetting(user);
                        }}
                      >
                        {t("resetPassword")}
                      </Button>
                      <Button
                        size="xs"
                        variant="destructive"
                        disabled={user.isActive === false}
                        onClick={() => setDeactivating(user)}
                      >
                        {t("deactivate")}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <PaginationBar
            pageInfo={
              usersQuery.data?.users.pageInfo ?? {
                offset,
                limit: PAGE_LIMIT,
                totalCount: users.length,
                hasNextPage: false,
              }
            }
            limit={PAGE_LIMIT}
            onOffsetChange={setOffset}
          />
        </>
      ) : null}

      {/* Create */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("createTitle")}</DialogTitle>
            <DialogDescription>{t("createDescription")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">{draftFields}</div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>
              {tCommon("cancel")}
            </Button>
            <Button
              disabled={
                createUser.loading ||
                !draft.userCode ||
                !draft.fullName ||
                !draft.email ||
                !draft.password
              }
              onClick={submitCreate}
            >
              {createUser.loading ? t("creating") : t("create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit */}
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("editTitle")}</DialogTitle>
            <DialogDescription>{editing?.fullName}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">{draftFields}</div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              {tCommon("cancel")}
            </Button>
            <Button disabled={updateUser.loading} onClick={submitEdit}>
              {updateUser.loading ? t("saving") : t("saveChanges")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset password */}
      <Dialog
        open={resetting !== null}
        onOpenChange={(open) => !open && setResetting(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("resetTitle")}</DialogTitle>
            <DialogDescription>
              {resetting
                ? t("resetDescription", { name: resetting.fullName })
                : null}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1">
            <Label htmlFor="reset-password">{t("fieldNewPassword")}</Label>
            <Input
              id="reset-password"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetting(null)}>
              {tCommon("cancel")}
            </Button>
            <Button
              disabled={resetPassword.loading || newPassword.length === 0}
              onClick={submitReset}
            >
              {resetPassword.loading ? t("resetting") : t("resetPassword")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate */}
      <Dialog
        open={deactivating !== null}
        onOpenChange={(open) => !open && setDeactivating(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("deactivateTitle")}</DialogTitle>
            <DialogDescription>
              {deactivating
                ? t("deactivateDescription", { name: deactivating.fullName })
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeactivating(null)}>
              {tCommon("cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={deactivateUser.loading}
              onClick={submitDeactivate}
            >
              {deactivateUser.loading ? t("deactivating") : t("deactivate")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
