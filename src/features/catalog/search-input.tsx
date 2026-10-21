import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { rpc } from "@/lib/supabase";
import {
  Autocomplete,
  AutocompleteInputGroup,
  AutocompleteInput,
  AutocompleteContent,
  AutocompleteList,
  AutocompleteItem,
} from "@/components/ui/autocomplete";
import { InputGroup, InputGroupAddon } from "@/components/ui/input-group";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
export type SearchSuggestion = {
  value: string;
  kind: "destination" | "country" | "category" | "package";
};
export function CatalogSearchInput({
  initial,
  onChoose,
}: {
  initial: string;
  onChoose: (item: SearchSuggestion) => void;
}) {
  const [value, setValue] = useState(initial),
    [debounced, setDebounced] = useState(initial.trim());
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value.trim()), 180);
    return () => window.clearTimeout(timer);
  }, [value]);
  const suggestions = useQuery({
    queryKey: ["search-suggestions", debounced],
    enabled: debounced.length >= 2,
    queryFn: async () =>
      (await rpc("search_suggestions", {
        query: debounced,
      })) as unknown as SearchSuggestion[],
    staleTime: 30000,
    retry: false,
  });
  const items = value.trim() === debounced ? (suggestions.data ?? []) : [];
  return (
    <Field>
      <FieldLabel htmlFor="q" className="sr-only">
        Destination or experience
      </FieldLabel>
      <Autocomplete<SearchSuggestion>
        name="q"
        items={items}
        filter={null}
        value={value}
        itemToStringValue={(item) => item.value}
        onValueChange={(next, details) => {
          setValue(next);
          if (details.reason === "item-press") {
            const selected = items.find((item) => item.value === next);
            if (selected) onChoose(selected);
          }
        }}
      >
        <AutocompleteInputGroup
          render={<InputGroup />}
          className="h-16 w-full rounded-lg bg-card p-2 shadow-sm"
        >
          <AutocompleteInput
            id="q"
            maxLength={120}
            autoComplete="off"
            placeholder="Where would you like to go?"
          />
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupAddon align="inline-end">
            <Button type="submit" aria-label="Search experiences">
              <Search data-icon="inline-start" />
              <span className="hidden sm:inline">Search</span>
            </Button>
          </InputGroupAddon>
        </AutocompleteInputGroup>
        <AutocompleteContent>
          <AutocompleteList>
            {(item: SearchSuggestion) => (
              <AutocompleteItem key={`${item.kind}:${item.value}`} value={item}>
                <span className="min-w-0 flex-1 truncate">{item.value}</span>
                <span className="text-xs text-muted-foreground">
                  {item.kind}
                </span>
              </AutocompleteItem>
            )}
          </AutocompleteList>
        </AutocompleteContent>
      </Autocomplete>
      {suggestions.error && value.trim().length >= 2 && (
        <p className="text-xs text-muted-foreground">
          Suggestions are unavailable. You can still search by typing a place or
          experience.
        </p>
      )}
    </Field>
  );
}
