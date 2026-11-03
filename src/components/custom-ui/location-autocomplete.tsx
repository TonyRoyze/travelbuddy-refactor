import { useState } from "react";
import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteInput,
  AutocompleteInputGroup,
  AutocompleteItem,
  AutocompleteList,
} from "@/components/ui/autocomplete";
import { InputGroup } from "@/components/ui/input-group";
import { discoveryTowns } from "@/features/nearby/towns";

const defaultLocations = discoveryTowns();

export function LocationAutocomplete({
  id,
  name,
  value,
  defaultValue = "",
  onValueChange,
  onChoose,
  suggestions = defaultLocations,
  placeholder = "Search for a town or area",
  disabled,
  required,
  minLength,
}: {
  id: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  onChoose?: (value: string) => void;
  suggestions?: string[];
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  minLength?: number;
}) {
  const [inputValue, setInputValue] = useState(defaultValue);

  return (
    <Autocomplete
      name={name}
      items={suggestions}
      value={value ?? inputValue}
      disabled={disabled}
      openOnInputClick
      onValueChange={(nextValue, details) => {
        setInputValue(nextValue);
        onValueChange?.(nextValue);
        if (details.reason === "item-press") onChoose?.(nextValue);
      }}
    >
      <AutocompleteInputGroup render={<InputGroup />}>
        <AutocompleteInput
          id={id}
          placeholder={placeholder}
          autoComplete="off"
          required={required}
          minLength={minLength}
          maxLength={120}
        />
      </AutocompleteInputGroup>
      <AutocompleteContent>
        <AutocompleteList>
          {(location: string) => (
            <AutocompleteItem key={location} value={location}>
              {location}
            </AutocompleteItem>
          )}
        </AutocompleteList>
      </AutocompleteContent>
    </Autocomplete>
  );
}
