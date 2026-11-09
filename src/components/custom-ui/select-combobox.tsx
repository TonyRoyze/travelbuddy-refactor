"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CheckIcon, ChevronsUpDownIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

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
  searchPlaceholder = "Search options…",
  emptyMessage = "No options found.",
  disabled,
  className,
  ariaLabel,
  onCreateOption,
}: {
  id: string;
  name?: string;
  options: SelectComboboxOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  onCreateOption?: (value: string) => void;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const searchRef = useRef<HTMLInputElement>(null);
  const keyboardOpen = useRef(false);
  const selectedValue = value ?? uncontrolledValue;
  const selected = options.find((option) => option.value === selectedValue);
  const customValue = query.trim();
  const canCreate =
    !!onCreateOption &&
    !!customValue &&
    !options.some(
      (option) =>
        option.label.toLowerCase() === customValue.toLowerCase() ||
        option.value.toLowerCase() === customValue.toLowerCase(),
    );

  useEffect(() => {
    if (!open) {
      keyboardOpen.current = false;
      setMounted(false);
      setQuery("");
      return;
    }
    const timer = window.setTimeout(() => setMounted(true), 50);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (mounted && keyboardOpen.current) searchRef.current?.focus();
  }, [mounted]);

  function select(nextValue: string) {
    if (value === undefined) setUncontrolledValue(nextValue);
    onValueChange?.(nextValue);
    setOpen(false);
  }

  return (
    <>
      {name && (
        <input
          type="hidden"
          name={name}
          value={selectedValue}
          disabled={disabled}
        />
      )}
      <Popover
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) keyboardOpen.current = false;
          setOpen(nextOpen);
        }}
      >
        <PopoverTrigger
          render={
            <Button
              id={id}
              type="button"
              variant="outline"
              role="combobox"
              aria-label={ariaLabel}
              aria-expanded={open}
              aria-controls={open ? listId : undefined}
              aria-haspopup="listbox"
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  keyboardOpen.current = true;
                  setOpen(true);
                }
              }}
              disabled={disabled}
              className={cn(
                "w-full justify-between bg-background px-3 font-normal hover:bg-background",
                className,
              )}
            >
              <span
                className={cn("truncate", !selected && "text-muted-foreground")}
              >
                {selected?.label ?? placeholder}
              </span>
              <ChevronsUpDownIcon
                className="size-4 shrink-0 text-muted-foreground/80 opacity-50"
                aria-hidden="true"
              />
            </Button>
          }
        />
        <PopoverContent
          align="start"
          id={listId}
          className="w-[var(--anchor-width)] max-w-[var(--available-width)] gap-0 border border-input p-0"
          initialFocus={(interaction) => {
            keyboardOpen.current ||= interaction === "keyboard";
            return false;
          }}
        >
          {mounted && (
            <Command>
              <CommandInput
                ref={searchRef}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                value={query}
                onValueChange={setQuery}
                className="text-base sm:text-sm"
              />
              <CommandList>
                <CommandEmpty>{emptyMessage}</CommandEmpty>
                <CommandGroup>
                  {options.map((option) => (
                    <CommandItem
                      key={option.value}
                      value={option.value || option.label}
                      keywords={[option.label]}
                      disabled={option.disabled}
                      onSelect={() => select(option.value)}
                      className="min-h-11 [&>svg:last-of-type]:hidden"
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {option.label}
                      </span>
                      {selectedValue === option.value && (
                        <CheckIcon
                          className="ml-auto size-4 block!"
                          aria-hidden="true"
                        />
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
                {canCreate && (
                  <>
                    <CommandSeparator />
                    <CommandGroup forceMount>
                      <CommandItem
                        forceMount
                        value={`create:${customValue}`}
                        onSelect={() => {
                          onCreateOption?.(customValue);
                          if (value === undefined)
                            setUncontrolledValue(customValue);
                          setOpen(false);
                        }}
                        className="min-h-11 [&>svg:last-of-type]:hidden"
                      >
                        <PlusIcon
                          className="size-4 block! opacity-60"
                          aria-hidden="true"
                        />
                        <span className="truncate">Add “{customValue}”</span>
                      </CommandItem>
                    </CommandGroup>
                  </>
                )}
              </CommandList>
            </Command>
          )}
        </PopoverContent>
      </Popover>
    </>
  );
}
