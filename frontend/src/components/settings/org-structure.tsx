"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
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
import { DEPARTMENTS_QUERY } from "@/lib/mes/queries/common";
import {
  CREATE_DEPARTMENT_MUTATION,
  UPDATE_DEPARTMENT_MUTATION,
  USERS_QUERY,
} from "@/lib/mes/queries/settings";
import type {
  Connection,
  DepartmentDetail,
  DepartmentType,
  UserRef,
} from "@/lib/mes/queries/types";
import { useApiQuery } from "@/lib/mes/queries/use-api";
import { useMutation } from "@/lib/mes/session";

interface DepartmentDraft {
  code: string;
  name: string;
  departmentType: DepartmentType;
  parentId: string;
  managerId: string;
  autoForkingEnabled: boolean;
  isActive: boolean;
}

const EMPTY_DRAFT: DepartmentDraft = {
  code: "",
  name: "",
  departmentType: "DEPARTMENT",
  parentId: "",
  managerId: "",
  autoForkingEnabled: true,
  isActive: true,
};

/**
 * Org Structure — the department/division hierarchy with create/edit and a
 * per-department Auto-forking toggle that controls whether new Jobs tickets
 * replicate to the department's active members.
 */
export function OrgStructure() {
  const t = useTranslations("settings.org");
  const tCommon = useTranslations("common");
  const labels = useDomainLabels();
  const [creating, setCreating] = useState(false);
  const errorText = useErrorText();
  const [editing, setEditing] = useState<DepartmentDetail | null>(null);
  const [draft, setDraft] = useState<DepartmentDraft>(EMPTY_DRAFT);
  const [feedback, setFeedback] = useState<{
    tone: "error" | "success";
    message: string;
  } | null>(null);

  const departmentsQuery = useApiQuery<{ departments: DepartmentDetail[] }>(
    DEPARTMENTS_QUERY,
    {},
    { liveArea: "users" },
  );
  const usersQuery = useApiQuery<{ users: Connection<UserRef> }>(
    USERS_QUERY,
    {
      limit: 200,
    },
    { liveArea: "users" },
  );

  const createDepartment = useMutation<unknown>(CREATE_DEPARTMENT_MUTATION);
  const updateDepartment = useMutation<unknown>(UPDATE_DEPARTMENT_MUTATION);

  const departments = departmentsQuery.data?.departments ?? [];
  const managers = usersQuery.data?.users.nodes ?? [];

  const openCreate = () => {
    setDraft(EMPTY_DRAFT);
    setFeedback(null);
    setCreating(true);
  };

  const openEdit = (department: DepartmentDetail) => {
    setDraft({
      code: department.code,
      name: department.name,
      departmentType: department.departmentType,
      parentId: department.parent?.id ?? "",
      managerId: department.manager?.id ?? "",
      autoForkingEnabled: department.autoForkingEnabled,
      isActive: department.isActive,
    });
    setFeedback(null);
    setEditing(department);
  };

  const toggleAutoForking = async (
    department: DepartmentDetail,
    enabled: boolean,
  ) => {
    setFeedback(null);
    try {
      await updateDepartment.run({
        input: { id: department.id, autoForkingEnabled: enabled },
      });
      setFeedback({
        tone: "success",
        message: enabled
          ? t("autoForkingEnabledMsg", { name: department.name })
          : t("autoForkingDisabledMsg", { name: department.name }),
      });
      departmentsQuery.refetch();
    } catch (cause) {
      setFeedback({
        tone: "error",
        message: errorText(cause),
      });
    }
  };

  const submitCreate = async () => {
    setFeedback(null);
    try {
      await createDepartment.run({
        input: {
          code: draft.code.trim(),
          name: draft.name.trim(),
          departmentType: draft.departmentType,
          parentId: draft.parentId || undefined,
          managerId: draft.managerId || undefined,
          autoForkingEnabled: draft.autoForkingEnabled,
        },
      });
      setCreating(false);
      setFeedback({ tone: "success", message: t("created") });
      departmentsQuery.refetch();
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
      await updateDepartment.run({
        input: {
          id: editing.id,
          name: draft.name.trim(),
          parentId: draft.parentId || undefined,
          managerId: draft.managerId || undefined,
          autoForkingEnabled: draft.autoForkingEnabled,
          isActive: draft.isActive,
        },
      });
      setEditing(null);
      setFeedback({ tone: "success", message: t("updated") });
      departmentsQuery.refetch();
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
        <Label htmlFor="dept-code">{t("fieldCode")}</Label>
        <Input
          id="dept-code"
          value={draft.code}
          disabled={editing !== null}
          onChange={(event) =>
            setDraft((current) => ({ ...current, code: event.target.value }))
          }
        />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="dept-name">{t("fieldName")}</Label>
        <Input
          id="dept-name"
          value={draft.name}
          onChange={(event) =>
            setDraft((current) => ({ ...current, name: event.target.value }))
          }
        />
      </div>
      {editing === null ? (
        <div className="grid gap-1">
          <Label htmlFor="dept-type">{t("fieldType")}</Label>
          <Select
            value={draft.departmentType}
            onValueChange={(value) =>
              setDraft((current) => ({
                ...current,
                departmentType: value as DepartmentType,
              }))
            }
            items={Object.fromEntries(
              (["DEPARTMENT", "DIVISION"] as DepartmentType[]).map((value) => [
                value,
                labels.departmentType(value),
              ]),
            )}
          >
            <SelectTrigger id="dept-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="DEPARTMENT">
                {labels.departmentType("DEPARTMENT")}
              </SelectItem>
              <SelectItem value="DIVISION">
                {labels.departmentType("DIVISION")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <div className="grid gap-1">
        <Label htmlFor="dept-parent">{t("fieldParent")}</Label>
        <Select
          value={draft.parentId || "NONE"}
          onValueChange={(value) =>
            setDraft((current) => ({
              ...current,
              parentId: !value || value === "NONE" ? "" : value,
            }))
          }
        >
          <SelectTrigger id="dept-parent" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="NONE">{t("noParent")}</SelectItem>
            {departments
              .filter((department) => department.id !== editing?.id)
              .map((department) => (
                <SelectItem key={department.id} value={department.id}>
                  {department.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1">
        <Label htmlFor="dept-manager">{t("fieldManager")}</Label>
        <Select
          value={draft.managerId || "NONE"}
          onValueChange={(value) =>
            setDraft((current) => ({
              ...current,
              managerId: !value || value === "NONE" ? "" : value,
            }))
          }
        >
          <SelectTrigger id="dept-manager" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="NONE">{t("noManager")}</SelectItem>
            {managers.map((manager) => (
              <SelectItem key={manager.id} value={manager.id}>
                {manager.fullName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-3">
        <Switch
          id="dept-autofork"
          checked={draft.autoForkingEnabled}
          onCheckedChange={(checked) =>
            setDraft((current) => ({ ...current, autoForkingEnabled: checked }))
          }
        />
        <Label htmlFor="dept-autofork">{t("fieldAutoForking")}</Label>
      </div>
      {editing ? (
        <div className="flex items-center gap-3">
          <Switch
            id="dept-active"
            checked={draft.isActive}
            onCheckedChange={(checked) =>
              setDraft((current) => ({ ...current, isActive: checked }))
            }
          />
          <Label htmlFor="dept-active">{t("fieldActive")}</Label>
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

      {feedback ? (
        <InlineAlert tone={feedback.tone}>{feedback.message}</InlineAlert>
      ) : null}
      {departmentsQuery.error ? (
        <ErrorState
          error={departmentsQuery.error}
          onRetry={departmentsQuery.refetch}
        />
      ) : null}
      {departmentsQuery.loading && !departmentsQuery.data ? (
        <LoadingState label={t("loading")} rows={4} />
      ) : null}

      {departmentsQuery.data && departments.length === 0 ? (
        <EmptyState
          title={t("emptyTitle")}
          description={t("emptyDescription")}
        />
      ) : null}

      {departments.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">{t("colCode")}</TableHead>
              <TableHead>{t("colName")}</TableHead>
              <TableHead className="w-32">{t("colType")}</TableHead>
              <TableHead className="w-40">{t("colParent")}</TableHead>
              <TableHead className="w-40">{t("colManager")}</TableHead>
              <TableHead className="w-20">{t("colActive")}</TableHead>
              <TableHead className="w-48">{t("colAutoForking")}</TableHead>
              <TableHead className="w-20">{t("colEdit")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {departments.map((department) => (
              <TableRow key={department.id}>
                <TableCell className="font-mono text-xs">
                  {department.code}
                </TableCell>
                <TableCell className="text-sm">{department.name}</TableCell>
                <TableCell className="text-xs">
                  {labels.departmentType(department.departmentType)}
                </TableCell>
                <TableCell className="text-xs">
                  {department.parent?.name ?? "—"}
                </TableCell>
                <TableCell className="text-xs">
                  {department.manager?.fullName ?? "—"}
                </TableCell>
                <TableCell className="text-xs">
                  {department.isActive ? t("yes") : t("no")}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Switch
                      aria-label={t("autoForkingAria", {
                        name: department.name,
                      })}
                      checked={department.autoForkingEnabled}
                      onCheckedChange={(checked) =>
                        toggleAutoForking(department, checked)
                      }
                    />
                    <span className="text-xs text-muted-foreground">
                      {department.autoForkingEnabled
                        ? t("enabled")
                        : t("disabled")}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => openEdit(department)}
                  >
                    {t("edit")}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}

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
              disabled={createDepartment.loading || !draft.code || !draft.name}
              onClick={submitCreate}
            >
              {createDepartment.loading ? t("creating") : t("create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("editTitle")}</DialogTitle>
            <DialogDescription>{editing?.name}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">{draftFields}</div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              {tCommon("cancel")}
            </Button>
            <Button disabled={updateDepartment.loading} onClick={submitEdit}>
              {updateDepartment.loading ? t("saving") : t("saveChanges")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
