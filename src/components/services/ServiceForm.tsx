"use client";

import { useActionState } from "react";
import MediaField from "@/components/admin/MediaField";
import { saveServiceAction, type ServiceState } from "@/lib/services/actions";

const field =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900";

export type ServiceFormValues = {
  slug: string;
  title: string;
  heldOn: string;
  startsAt: string;
  backgroundSrc: string | null;
  notes: string;
};

export default function ServiceForm({
  tenant,
  service,
  uploadsEnabled,
}: {
  tenant: string;
  service?: ServiceFormValues;
  uploadsEnabled: boolean;
}) {
  const [state, action, pending] = useActionState<ServiceState, FormData>(saveServiceAction, {});
  const echoed = state.values;
  const initial = (name: string, fallback: string) => echoed?.[name] ?? fallback;
  const formKey = echoed ? JSON.stringify(echoed).length : 0;

  return (
    <form action={action} className="space-y-5" key={`service-${formKey}`}>
      <input type="hidden" name="tenant" value={tenant} />
      {service ? <input type="hidden" name="originalSlug" value={service.slug} /> : null}

      <div className="grid gap-5 sm:grid-cols-3">
        <div className="space-y-1.5 sm:col-span-3">
          <label htmlFor="title" className="text-sm font-medium">
            Service
          </label>
          <input
            id="title"
            name="title"
            defaultValue={initial("title", service?.title ?? "")}
            placeholder="Sunday Morning"
            required
            className={field}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="heldOn" className="text-sm font-medium">
            Date
          </label>
          <input
            id="heldOn"
            name="heldOn"
            type="date"
            defaultValue={initial("heldOn", service?.heldOn ?? "")}
            required
            className={field}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="startsAt" className="text-sm font-medium">
            Starts
          </label>
          <input
            id="startsAt"
            name="startsAt"
            defaultValue={initial("startsAt", service?.startsAt ?? "10:00")}
            placeholder="10:00"
            className={field}
          />
          <p className="text-xs text-stone-500">24-hour, like 10:00 or 18:30.</p>
        </div>
      </div>

      <MediaField
        name="backgroundSrc"
        label="Background on the projector"
        tenant={tenant}
        defaultValue={initial("backgroundSrc", service?.backgroundSrc ?? "")}
        accept="image/*"
        kinds={["image"]}
        uploadsEnabled={uploadsEnabled}
        hint="Sits behind the words for the whole service. Anything busy or bright makes lyrics hard to read from the back — the screen darkens it, but a quiet picture still wins. Leave it empty for black."
      />

      <div className="space-y-1.5">
        <label htmlFor="notes" className="text-sm font-medium">
          Notes <span className="font-normal text-stone-500">(optional)</span>
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={initial("notes", service?.notes ?? "")}
          className={field}
        />
      </div>

      {state.error ? (
        <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-amber-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
      >
        {pending ? "Saving…" : service ? "Save service" : "Create the service"}
      </button>
    </form>
  );
}
