"use client";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { FormField, Input, Select } from "@/components/ui/form";

export type SlotFormValue = {
  weekday: string;
  startTime: string;
  endTime: string;
  room: string;
  capacity: string;
};

export const DEFAULT_SLOT_FORM_VALUE: SlotFormValue = {
  weekday: "0",
  startTime: "16:00",
  endTime: "18:00",
  room: "",
  capacity: "",
};

export function slotFormValueFromSlot(slot: {
  weekday: number;
  startTime: string;
  endTime: string | null;
  room: string | null;
  capacity: number | null;
}): SlotFormValue {
  return {
    weekday: String(slot.weekday),
    startTime: slot.startTime,
    endTime: slot.endTime ?? "",
    room: slot.room ?? "",
    capacity: slot.capacity !== null ? String(slot.capacity) : "",
  };
}

export function slotFormValuesToJson(slots: SlotFormValue[]): string {
  return JSON.stringify(
    slots.map((slot) => ({
      weekday: Number(slot.weekday),
      startTime: slot.startTime,
      endTime: slot.endTime.trim().length > 0 ? slot.endTime : null,
      room: slot.room.trim().length > 0 ? slot.room.trim() : null,
      capacity: slot.capacity.trim().length > 0 ? Number(slot.capacity) : null,
    })),
  );
}

export function SlotsEditor({
  slots,
  onChange,
  labels,
  weekdayNames,
}: {
  slots: SlotFormValue[];
  onChange: (slots: SlotFormValue[]) => void;
  labels: Record<string, string>;
  weekdayNames: string[];
}) {
  function update(index: number, patch: Partial<SlotFormValue>) {
    onChange(slots.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)));
  }

  function add() {
    onChange([...slots, { ...DEFAULT_SLOT_FORM_VALUE }]);
  }

  function remove(index: number) {
    if (slots.length <= 1) return;
    onChange(slots.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-sm font-medium text-foreground">{labels.slotsLabel ?? "Weekly slots"}</span>
        <Button type="button" variant="outline" size="xs" onClick={add}>
          <Icon name="plus" size="xs" className="me-1" />
          {labels.addSlot ?? "Add slot"}
        </Button>
      </div>

      {slots.map((slot, index) => (
        <div key={index} className="rounded-lg border border-border p-2">
          <div className="flex flex-wrap items-end gap-2">
            <FormField label={labels.weekday ?? "Day"} required className="w-36">
              <Select
                value={slot.weekday}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => update(index, { weekday: e.target.value })}
              >
                {weekdayNames.map((name, idx) => (
                  <option key={idx} value={String(idx)}>
                    {name}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField label={labels.startTime ?? "Start"} required className="w-28">
              <Input
                type="time"
                required
                value={slot.startTime}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => update(index, { startTime: e.target.value })}
              />
            </FormField>

            <FormField label={labels.endTime ?? "End"} className="w-28">
              <Input
                type="time"
                value={slot.endTime}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => update(index, { endTime: e.target.value })}
              />
            </FormField>

            <FormField label={labels.roomLocation ?? "Room"} className="flex-1 min-w-28">
              <Input
                value={slot.room}
                placeholder={labels.roomPlaceholder ?? ""}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => update(index, { room: e.target.value })}
              />
            </FormField>

            <FormField label={labels.capacity ?? "Capacity"} className="w-20">
              <Input
                type="number"
                min="1"
                max="500"
                value={slot.capacity}
                placeholder={labels.capacityPlaceholder ?? ""}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => update(index, { capacity: e.target.value })}
              />
            </FormField>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => remove(index)}
              disabled={slots.length <= 1}
              aria-label={labels.removeSlot ?? "Remove slot"}
              title={labels.removeSlot ?? "Remove slot"}
              className="mb-0.5"
            >
              <Icon name="x" size="sm" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
