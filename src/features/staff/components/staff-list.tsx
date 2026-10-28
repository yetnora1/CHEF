"use client";

import { AlertCircle, CheckCircle2, LoaderCircle, Lock, UserCog } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from "react";
import { AlertDialog, AlertDialogContent } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { APP_ROLES, type AppRole } from "@/lib/permissions/matrix";
import { cn } from "@/lib/utils";
import { setUserRolesAction, type RolesActionState } from "../actions";
import { ROLE_HUES } from "../role-hues";
import { isPrivilegedRole, type RoleEditing } from "../roles";
import { RoleChip } from "./role-chip";

export type StaffMemberView = {
  id: string;
  name: string;
  email: string | null;
  isYou: boolean;
  roles: AppRole[];
  /** Formatted on the server in the admin's language and the business time zone. */
  joined: string | null;
  lastSignIn: string | null;
  editing: RoleEditing;
};

/** Everyone with an account, their roles, and (for staff managers) a way to change them. */
export function StaffList({ members }: { members: StaffMemberView[] }) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border glass">
      {members.map((member) => (
        <StaffRow key={member.id} member={member} />
      ))}
    </ul>
  );
}

const IDLE: RolesActionState = { status: "idle" };

function StaffRow({ member }: { member: StaffMemberView }) {
  const t = useTranslations("AdminStaff");
  const tRoles = useTranslations("Roles");
  const formRef = useRef<HTMLFormElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const resultRef = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<AppRole>>(() => new Set(member.roles));
  const [confirming, setConfirming] = useState(false);
  const [state, dispatch, pending] = useActionState(setUserRolesAction, IDLE);

  const added = APP_ROLES.filter((role) => selected.has(role) && !member.roles.includes(role));
  const removed = member.roles.filter((role) => !selected.has(role));
  const changed = added.length + removed.length > 0;
  const touchesPrivileged = [...added, ...removed].some(isPrivilegedRole);

  // A save closes the editor; focus then moves to the outcome so it is announced.
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state.status === "success") setOpen(false);
  }
  useEffect(() => {
    if (state.status !== "idle") requestAnimationFrame(() => resultRef.current?.focus());
  }, [state]);
  // Opening the editor moves focus to its first role.
  useEffect(() => {
    if (open) formRef.current?.querySelector<HTMLInputElement>("input[type=checkbox]:enabled")?.focus();
  }, [open]);

  function close() {
    setOpen(false);
    requestAnimationFrame(() => openerRef.current?.focus());
  }

  function toggle(role: AppRole, on: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(role);
      else next.delete(role);
      return next;
    });
  }

  function submit() {
    setConfirming(false);
    const form = formRef.current;
    if (form) startTransition(() => dispatch(new FormData(form)));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!changed || pending) return;
    // Owner or administrator access, and removing all access, are confirmed first.
    if (touchesPrivileged || selected.size === 0) setConfirming(true);
    else submit();
  }

  const names = (roles: AppRole[]) => roles.map((role) => tRoles(role)).join(", ");
  const initial = (member.name.trim()[0] ?? "?").toUpperCase();
  // Roles arrive most privileged first, so the avatar takes the person's main role colour.
  const mainRole = member.roles[0];
  const editing = member.editing;
  const note = editing.editable
    ? null
    : editing.reason === "self"
      ? t("notEditableSelf")
      : editing.reason === "privilegedAccount"
        ? t("notEditablePrivileged")
        : null;

  return (
    <li
      id={`staff-${member.id}`}
      className={cn("scroll-mt-24 px-4 py-4 transition-colors sm:px-5", open && "bg-glass-raised")}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <span
          aria-hidden
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold",
            mainRole
              ? cn("tint-chip", ROLE_HUES[mainRole])
              : "border border-dashed border-border-strong text-muted-foreground",
          )}
        >
          {initial}
        </span>
        <div className="min-w-0 flex-1 basis-56">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-semibold break-words">{member.name}</span>
            {member.isYou && (
              <span className="rounded-full border border-border bg-glass-raised px-2 py-px text-xs font-medium">
                {t("you")}
              </span>
            )}
          </p>
          {member.email && member.email !== member.name && (
            <p className="text-sm break-all text-muted-foreground">{member.email}</p>
          )}
          <p className="mt-0.5 text-xs text-muted-foreground">
            {[
              member.joined ? t("joined", { date: member.joined }) : null,
              member.lastSignIn ? t("lastSignIn", { date: member.lastSignIn }) : t("neverSignedIn"),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {note && (
            <p className="mt-1.5 flex items-start gap-1.5 text-xs text-muted-foreground">
              <Lock aria-hidden className="mt-px size-3.5 shrink-0" />
              {note}
            </p>
          )}
        </div>
        <ul aria-label={t("rolesOf", { name: member.name })} className="flex flex-wrap items-center gap-1.5">
          {member.roles.length > 0 ? (
            member.roles.map((role) => (
              <li key={role}>
                <RoleChip role={role} label={tRoles(role)} />
              </li>
            ))
          ) : (
            <li className="rounded-full border border-dashed border-border-strong px-2.5 py-0.5 text-xs text-muted-foreground">
              {t("noRole")}
            </li>
          )}
        </ul>
        {editing.editable && !open && (
          <div className="flex flex-wrap items-center gap-3">
            <Outcome state={state} resultRef={resultRef} />
            <Button
              ref={openerRef}
              type="button"
              aria-label={t("changeRolesFor", { name: member.name })}
              variant="outline"
              size="sm"
              onClick={() => {
                setSelected(new Set(member.roles));
                setOpen(true);
              }}
            >
              <UserCog aria-hidden />
              {t("changeRoles")}
            </Button>
          </div>
        )}
      </div>

      {editing.editable && open && (
        <form
          ref={formRef}
          onSubmit={onSubmit}
          className="mt-4 space-y-4 rounded-xl border border-border bg-glass p-4 sm:ml-14"
        >
          <input type="hidden" name="userId" value={member.id} />
          <fieldset>
            <legend className="text-sm font-semibold">{t("rolesLegend", { name: member.name })}</legend>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {APP_ROLES.map((role) => {
                const locked = editing.lockedRoles.includes(role);
                return (
                  <label
                    key={role}
                    className={cn(
                      "flex items-start gap-3 rounded-xl border border-border bg-glass-raised p-3 transition-colors has-checked:border-action-bottom/60 has-checked:bg-action-bottom/5",
                      locked ? "cursor-not-allowed opacity-65" : "cursor-pointer hover:border-border-strong",
                    )}
                  >
                    <input
                      type="checkbox"
                      name="roles"
                      value={role}
                      checked={selected.has(role)}
                      disabled={locked || pending}
                      onChange={(event) => toggle(role, event.target.checked)}
                      className="mt-1 size-4 shrink-0 accent-action-bottom"
                    />
                    <span className="min-w-0 space-y-1">
                      <RoleChip role={role} label={tRoles(role)} />
                      <span className="block text-xs leading-relaxed text-muted-foreground">
                        {t(`roleDescriptions.${role}`)}
                      </span>
                      {locked && (
                        <span className="flex items-center gap-1 text-xs font-medium">
                          <Lock aria-hidden className="size-3" />
                          {t("lockedHint")}
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          {state.status === "error" && <Outcome state={state} resultRef={resultRef} />}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="action" size="sm" disabled={!changed || pending}>
              {pending && <LoaderCircle aria-hidden className="animate-spin" />}
              {pending ? t("saving") : t("save")}
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={close}>
              {t("cancel")}
            </Button>
          </div>
        </form>
      )}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent
          title={t("confirm.title", { name: member.name })}
          description={
            <>
              {added.length > 0 && (
                <span className="block">{t("confirm.adds", { roles: names(added) })}</span>
              )}
              {removed.length > 0 && (
                <span className="block">{t("confirm.removes", { roles: names(removed) })}</span>
              )}
              {touchesPrivileged && <span className="mt-2 block">{t("confirm.privileged")}</span>}
              {selected.size === 0 && (
                <span className="mt-2 block">{t("confirm.noAccess", { name: member.name })}</span>
              )}
            </>
          }
          cancelLabel={t("cancel")}
          confirmLabel={t("confirm.confirm")}
          onConfirm={submit}
        />
      </AlertDialog>
    </li>
  );
}

function Outcome({
  state,
  resultRef,
}: {
  state: RolesActionState;
  resultRef: RefObject<HTMLParagraphElement | null>;
}) {
  const t = useTranslations("AdminStaff");
  if (state.status === "idle") return null;
  const ok = state.status === "success";
  return (
    <p
      ref={resultRef}
      tabIndex={-1}
      role={ok ? "status" : "alert"}
      className={cn(
        "flex items-center gap-2 text-sm font-medium outline-none",
        ok ? "text-success" : "text-danger",
      )}
    >
      {ok ? <CheckCircle2 aria-hidden className="size-4" /> : <AlertCircle aria-hidden className="size-4" />}
      {ok ? t("saved") : t(`errors.${state.message}`)}
    </p>
  );
}
