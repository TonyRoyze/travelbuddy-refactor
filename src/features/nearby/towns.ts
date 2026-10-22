// Starter choices stay available even before a host publishes a meeting point.
export const sriLankanTowns = [
  "Anuradhapura",
  "Arugam Bay",
  "Badulla",
  "Bandarawela",
  "Batticaloa",
  "Bentota",
  "Beruwala",
  "Colombo",
  "Dambulla",
  "Ella",
  "Galle",
  "Habarana",
  "Haputale",
  "Hikkaduwa",
  "Jaffna",
  "Kalpitiya",
  "Kalutara",
  "Kandy",
  "Kataragama",
  "Kurunegala",
  "Matara",
  "Mirissa",
  "Negombo",
  "Nuwara Eliya",
  "Pasikuda",
  "Polonnaruwa",
  "Ratnapura",
  "Sigiriya",
  "Tangalle",
  "Tissamaharama",
  "Trincomalee",
  "Unawatuna",
  "Weligama",
] as const;
export function discoveryTowns(published: string[] = []) {
  const towns = new Map<string, string>(
    sriLankanTowns.map((town) => [town.toLowerCase(), town]),
  );
  for (const value of published) {
    const town = value.trim();
    if (town && !towns.has(town.toLowerCase()))
      towns.set(town.toLowerCase(), town);
  }
  return [...towns.values()].sort((a, b) => a.localeCompare(b, "en"));
}
