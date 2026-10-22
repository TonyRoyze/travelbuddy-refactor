import { useEffect, useRef, useState, useMemo } from "react";
import type * as Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
export type MapPoint = {
  id: string;
  latitude: number;
  longitude: number;
  label: string;
};
export function MeetingMap({
  points,
  selected,
  onSelect,
  onPick,
  className,
}: {
  points: MapPoint[];
  selected?: string;
  onSelect?: (id: string) => void;
  onPick?: (latitude: number, longitude: number) => void;
  className?: string;
}) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const tiles = useRef<Leaflet.TileLayer | null>(null);
  const library = useRef<typeof Leaflet | null>(null);
  const layer = useRef<Leaflet.LayerGroup | null>(null);
  const callbacks = useRef({ onSelect, onPick });
  const previousBounds = useRef("");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();
  const serialized = JSON.stringify(points);
  const stablePoints = useMemo(
    () => JSON.parse(serialized) as MapPoint[],
    [serialized],
  );
  useEffect(() => {
    callbacks.current = { onSelect, onPick };
  }, [onSelect, onPick]);
  useEffect(() => {
    let disposed = false;
    let resize: ResizeObserver | undefined;
    import("leaflet")
      .then((L) => {
        if (disposed || !element.current) return;
        library.current = L;
        const instance = L.map(element.current, {
          scrollWheelZoom: false,
        }).setView([7.4, 80.7], 7);
        map.current = instance;
        instance.attributionControl.setPrefix(false);
        tiles.current = L.tileLayer(
          "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
          {
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            maxZoom: 19,
          },
        ).addTo(instance);
        tiles.current.on("tileerror", () =>
          setError(
            "Map tiles could not load. You can still use the list and meeting-point details.",
          ),
        );
        layer.current = L.layerGroup().addTo(instance);
        instance.on("click", (event: Leaflet.LeafletMouseEvent) =>
          callbacks.current.onPick?.(
            Number(event.latlng.lat.toFixed(6)),
            Number(event.latlng.lng.toFixed(6)),
          ),
        );
        resize = new ResizeObserver(() =>
          instance.invalidateSize({ pan: false }),
        );
        resize.observe(element.current);
        setReady(true);
      })
      .catch(() => {
        if (!disposed)
          setError(
            "The map could not load. Use the list to explore meeting points.",
          );
      });
    return () => {
      disposed = true;
      resize?.disconnect();
      map.current?.remove();
      map.current = null;
      layer.current = null;
      previousBounds.current = "";
    };
  }, []);
  useEffect(() => {
    const L = library.current,
      instance = map.current,
      markers = layer.current;
    if (!ready || !L || !instance || !markers) return;
    markers.clearLayers();
    const groups = new Map<string, MapPoint[]>();
    stablePoints.forEach((point) => {
      const key = `${point.latitude},${point.longitude}`;
      groups.set(key, [...(groups.get(key) ?? []), point]);
    });
    for (const group of groups.values()) {
      const point = group.find((point) => point.id === selected) ?? group[0];
      const pin = document.createElement("span");
      pin.textContent =
        group.length > 1 ? `${group.length} experiences` : "Meet here";
      pin.className = cn(
        "inline-flex h-10 items-center whitespace-nowrap rounded-full border-2 px-3 font-sans text-sm font-semibold shadow-sm",
        group.some((point) => point.id === selected)
          ? "border-primary bg-primary text-primary-foreground"
          : "border-primary bg-card text-foreground",
      );
      const marker = L.marker([point.latitude, point.longitude], {
        icon: L.divIcon({
          className: "",
          html: pin,
          iconSize: [group.length > 1 ? 130 : 100, 40],
          iconAnchor: [50, 40],
        }),
        title: group.map((point) => point.label).join(", "),
        keyboard: true,
      }).addTo(markers);
      marker
        .getElement()
        ?.setAttribute(
          "aria-label",
          group.length > 1
            ? `${group.length} experiences at ${point.label}`
            : point.label,
        );
      marker.on("click", (event) => {
        L.DomEvent.stopPropagation(event.originalEvent);
        callbacks.current.onSelect?.(point.id);
      });
    }
    const boundsKey = stablePoints
      .map((point) => `${point.id}:${point.latitude},${point.longitude}`)
      .join(";");
    if (boundsKey && boundsKey !== previousBounds.current) {
      instance.fitBounds(
        L.latLngBounds(
          stablePoints.map((point) => [point.latitude, point.longitude]),
        ),
        { padding: [45, 45], maxZoom: 14, animate: false },
      );
      previousBounds.current = boundsKey;
    }
    const chosen = stablePoints.find((point) => point.id === selected);
    if (
      chosen &&
      !instance.getBounds().contains([chosen.latitude, chosen.longitude])
    )
      instance.panTo([chosen.latitude, chosen.longitude], { animate: false });
  }, [stablePoints, selected, ready]);
  return (
    <div
      className={cn(
        "relative isolate overflow-hidden rounded-xl border bg-muted",
        className,
      )}
    >
      <div
        ref={element}
        role="region"
        aria-label={
          onPick
            ? "Choose the experience meeting point on the map"
            : "Online providers’ experience meeting points"
        }
        className="h-full min-h-80 w-full"
      />
      {error && (
        <div className="absolute inset-x-3 bottom-8 z-[1000]">
          <Alert>
            <AlertDescription>
              {error}
              <Button
                variant="link"
                onClick={() => {
                  setError(undefined);
                  tiles.current?.redraw();
                }}
              >
                Retry map
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      )}
    </div>
  );
}
