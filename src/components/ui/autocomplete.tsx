import { Autocomplete as AutocompletePrimitive } from "@base-ui/react/autocomplete";
import { cn } from "@/lib/utils";
import { InputGroupInput } from "@/components/ui/input-group";
const Autocomplete = AutocompletePrimitive.Root;
const AutocompleteInputGroup = AutocompletePrimitive.InputGroup;
function AutocompleteInput(props: AutocompletePrimitive.Input.Props) {
  return (
    <AutocompletePrimitive.Input render={<InputGroupInput />} {...props} />
  );
}
function AutocompleteContent({
  className,
  ...props
}: AutocompletePrimitive.Popup.Props) {
  return (
    <AutocompletePrimitive.Portal>
      <AutocompletePrimitive.Positioner sideOffset={6} className="isolate z-50">
        <AutocompletePrimitive.Popup
          className={cn(
            "max-h-(--available-height) w-(--anchor-width) max-w-(--available-width) overflow-hidden rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10",
            className,
          )}
          {...props}
        />
      </AutocompletePrimitive.Positioner>
    </AutocompletePrimitive.Portal>
  );
}
function AutocompleteList({
  className,
  ...props
}: AutocompletePrimitive.List.Props) {
  return (
    <AutocompletePrimitive.List
      className={cn(
        "max-h-80 overflow-y-auto overscroll-contain outline-none",
        className,
      )}
      {...props}
    />
  );
}
function AutocompleteItem({
  className,
  ...props
}: AutocompletePrimitive.Item.Props) {
  return (
    <AutocompletePrimitive.Item
      className={cn(
        "flex cursor-default items-center gap-3 rounded-md px-3 py-3 text-sm outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground",
        className,
      )}
      {...props}
    />
  );
}
export {
  Autocomplete,
  AutocompleteInputGroup,
  AutocompleteInput,
  AutocompleteContent,
  AutocompleteList,
  AutocompleteItem,
};
