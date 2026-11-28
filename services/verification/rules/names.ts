function tokens(name: string) {
  return (
    name
      .normalize("NFKD")
      .toLowerCase()
      .match(/[\p{L}\p{M}]+/gu) ?? []
  );
}

function oneEditApart(first: string, second: string) {
  const a = [...first],
    b = [...second];
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0,
    j = 0,
    edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length === b.length && a[i] === b[j + 1] && a[i + 1] === b[j]) {
      i += 2;
      j += 2;
      continue;
    }
    if (a.length >= b.length) i++;
    if (b.length >= a.length) j++;
  }
  return edits + a.length - i + b.length - j <= 1;
}

export function compareSriLankanNames(left: string, right: string): boolean {
  const a = tokens(left),
    b = tokens(right);
  if (!a.length || a.length !== b.length) return false;
  let fullMatches = 0;
  let edits = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) {
      if (a[i].length > 1) fullMatches++;
    } else if (
      a[i][0] === b[i][0] &&
      Math.min(a[i].length, b[i].length) === 1
    ) {
      continue;
    } else if (
      Math.min(a[i].length, b[i].length) >= 4 &&
      oneEditApart(a[i], b[i])
    ) {
      edits++;
    } else return false;
  }
  return fullMatches > 0 && edits <= 1;
}
