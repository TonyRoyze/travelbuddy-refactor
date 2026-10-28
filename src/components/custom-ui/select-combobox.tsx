"use client";

import { useState } from "react";
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";

export interface SelectComboboxOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export function SelectCombobox({
  id,
  name,
  options,
  value,
  defaultValue = "",
  onValueChange,
  placeholder = "Select an option",
  disabled,
}: {
  id: string;
  name?: string;
  options: SelectComboboxOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const selectedValue = value ?? uncontrolledValue;

  return (
    <>
      {name && <input type="hidden" name={name} value={selectedValue} />}
      <Combobox
        value={selectedValue}
        onValueChange={(nextValue) => {
          if (typeof nextValue !== "string") return;
          if (value === undefined) setUncontrolledValue(nextValue);
          onValueChange?.(nextValue);
        }}
      >
        <ComboboxInput
          id={id}
          aria-label={id}
          placeholder={placeholder}
          className="w-full"
          disabled={disabled}
        />
        <ComboboxContent>
          <ComboboxList>
            {options.map((option) => (
              <ComboboxItem
                key={option.value}
                value={option.value}
                disabled={option.disabled}
              >
                {option.label}
              </ComboboxItem>
            ))}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </>
  );
}
