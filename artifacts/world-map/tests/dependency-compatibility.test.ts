import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";

const rows = [
  ["Name", "Type", "Times Visited", "First Year", "Most Recent Year"],
  ["France", "country", 3, 2010, 2023],
  ["California", "state", 5, 2005, 2024],
  ["Ontario", "province", 2, 2018, 2022],
  ["France (Metropolitan)", "tcc", 1, 2022, 2022],
];

for (const bookType of ["xlsx", "xls"] as const) {
  test(`patched spreadsheet engine preserves ${bookType} import/export`, () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet["!cols"] = [{ wch: 30 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(workbook, sheet, "Travel Tracker");
    const bytes = XLSX.write(workbook, { type: "array", bookType });
    const imported = XLSX.read(bytes, { type: "array" });
    assert.deepEqual(
      XLSX.utils.sheet_to_json(imported.Sheets[imported.SheetNames[0]], { defval: "" }),
      rows.slice(1).map((row) => Object.fromEntries(rows[0].map((key, i) => [key, row[i]]))),
    );
  });
}

