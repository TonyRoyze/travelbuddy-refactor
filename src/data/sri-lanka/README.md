# Sri Lankan location data

Source: [shendew/provinces_cities_srilanka](https://github.com/shendew/provinces_cities_srilanka), commit `6f8532405d67c9ee6763f2f27691ff1ea943d075`.

`locations.json` is extracted from the repository's `Database Files/thedevsl_provinces_cities_api.sql` dump (dated September 11, 2023). It contains 9 provinces, 25 districts and 331 cities/divisions, retaining source names, translations and parent IDs. The dump does not contain the sub-city data mentioned in the API documentation. Names and coverage reflect the upstream snapshot.

The original API hostname was unavailable when imported, so suggestions use this local snapshot. The upstream Apache 2.0 license is included in `LICENSE`. Data is attributed to Shehara Dewanagala / shendew.

To download and regenerate the snapshot from the pinned revision:

```sh
python3 scripts/download-sri-lanka-locations.py
```

The downloader parses SQL literals without executing SQL and checks record counts, unique IDs and district/province references before writing files. Review changes before updating its pinned revision.
