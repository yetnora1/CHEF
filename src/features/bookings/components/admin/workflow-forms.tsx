"use client";

import { CheckCircle2, LoaderCircle } from "lucide-react";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { AlertDialog, AlertDialogContent } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, NativeSelect, Textarea } from "@/components/ui/form-controls";
import {
  addBookingNoteAction,
  assignBookingAction,
  changeBookingStatusAction,
  type AdminActionState,
} from "../../admin-actions";
import { BOOKING_TRANSITIONS, CONSEQUENTIAL_STATUSES, type BookingStatus } from "../../status";

/*
 * Client forms for the inquiry workflow. They only collect input: every
 * action re-authorizes on the server and in the database. Labels arrive as
 * props so admin strings are not shipped in the client message bundle.
 */

const IDLE: AdminActionState = { status: "idle" };

type ResultLabels = Record<Extract<AdminActionState, { status: "error" }>["message"] | "saved", string>;

function Result({ state, labels }: { state: AdminActionState; labels: ResultLabels }) {
  if (state.status === "idle") return null;
  return (
    <p role="status" className={state.status === "success" ? "text-sm text-success" : "text-sm text-danger"}>
      {state.status === "success" ? (
        <span className="inline-flex items-center gap-1.5">
          <CheckCircle2 aria-hidden className="size-4" />
          {labels.saved}
        </span>
      ) : (
        labels[state.message]
      )}
    </p>
  );
}

export function StatusForm({
  bookingId,
  current,
  statusLabels,
  labels,
  results,
}: {
  bookingId: string;
  current: BookingStatus;
  statusLabels: Record<BookingStatus, string>;
  labels: {
    nextStatus: string;
    choose: string;
    note: string;
    submit: string;
    noTransitions: string;
    /** Pre-rendered on the server: functions cannot cross to the client. */
    confirmTitles: Record<BookingStatus, string>;
    confirmBody: string;
    confirmConfirmedBody: string;
    confirm: string;
    cancel: string;
  };
  results: ResultLabels;
}) {
  const [state, dispatch, pending] = useActionState(changeBookingStatusAction, IDLE);
  const [target, setTarget] = useState<BookingStatus | "">("");
  const [confirming, setConfirming] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  // The detail page keys this form by the current status, so a successful
  // change remounts it with fresh state.
  const options = BOOKING_TRANSITIONS[current];

  if (options.length === 0) return <p className="text-sm text-muted-foreground">{labels.noTransitions}</p>;

  const submit = () => startTransition(() => dispatch(new FormData(formRef.current!)));

  return (
    <form
      ref={formRef}
      method="post"
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!target) return;
        if (CONSEQUENTIAL_STATUSES.has(target)) setConfirming(true);
        else submit();
      }}
    >
      <input type="hidden" name="bookingId" value={bookingId} />
      <Field id="status-target" label={labels.nextStatus}>
        <NativeSelect
          id="status-target"
          name="toStatus"
          value={target}
          required
          onChange={(event) => setTarget(event.target.value as BookingStatus)}
        >
          <option value="" disabled>
            {labels.choose}
          </option>
          {options.map((status) => (
            <option key={status} value={status}>
              {statusLabels[status]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field id="status-note" label={labels.note}>
        <Textarea id="status-note" name="note" rows={2} maxLength={1000} className="min-h-20" />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="action" size="sm" disabled={pending || !target}>
          {pending && <LoaderCircle aria-hidden className="animate-spin" />}
          {labels.submit}
        </Button>
        <Result state={state} labels={results} />
      </div>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        {target && (
          <AlertDialogContent
            title={labels.confirmTitles[target]}
            description={target === "confirmed" ? labels.confirmConfirmedBody : labels.confirmBody}
            cancelLabel={labels.cancel}
            confirmLabel={labels.confirm}
            tone={target === "declined" || target === "cancelled" ? "danger" : "default"}
            onConfirm={submit}
          />
        )}
      </AlertDialog>
    </form>
  );
}

export function AssignForm({
  bookingId,
  current,
  staff,
  labels,
  results,
}: {
  bookingId: string;
  current: string | null;
  staff: { id: string; name: string }[];
  labels: {
    assignTo: string;
    unassigned: string;
    submit: string;
    confirmTitle: string;
    confirmBody: string;
    confirm: string;
    cancel: string;
  };
  results: ResultLabels;
}) {
  const [state, dispatch, pending] = useActionState(assignBookingAction, IDLE);
  const [value, setValue] = useState(current ?? "");
  const [confirming, setConfirming] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const submit = () => startTransition(() => dispatch(new FormData(formRef.current!)));
  const changed = value !== (current ?? "");

  return (
    <form
      ref={formRef}
      method="post"
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!changed) return;
        // Taking an inquiry away from someone is consequential; first assignment is not.
        if (current) setConfirming(true);
        else submit();
      }}
    >
      <input type="hidden" name="bookingId" value={bookingId} />
      <Field id="assignee" label={labels.assignTo}>
        <NativeSelect
          id="assignee"
          name="assignee"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        >
          <option value="">{labels.unassigned}</option>
          {staff.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" variant="outline" disabled={pending || !changed}>
          {pending && <LoaderCircle aria-hidden className="animate-spin" />}
          {labels.submit}
        </Button>
        <Result state={state} labels={results} />
      </div>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent
          title={labels.confirmTitle}
          description={labels.confirmBody}
          cancelLabel={labels.cancel}
          confirmLabel={labels.confirm}
          onConfirm={submit}
        />
      </AlertDialog>
    </form>
  );
}

export function NoteForm({
  bookingId,
  labels,
  results,
}: {
  bookingId: string;
  labels: { note: string; placeholder: string; submit: string };
  results: ResultLabels;
}) {
  const [state, dispatch, pending] = useActionState(addBookingNoteAction, IDLE);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state]);

  return (
    <form
      ref={formRef}
      method="post"
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        if (!String(data.get("body") ?? "").trim()) return;
        startTransition(() => dispatch(data));
      }}
    >
      <input type="hidden" name="bookingId" value={bookingId} />
      <Field id="note-body" label={labels.note}>
        <Textarea
          id="note-body"
          name="body"
          rows={3}
          maxLength={4000}
          placeholder={labels.placeholder}
          required
        />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {pending && <LoaderCircle aria-hidden className="animate-spin" />}
          {labels.submit}
        </Button>
        <Result state={state} labels={results} />
      </div>
    </form>
  );
}
