import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { DEFAULT_FIELDS, DEFAULT_STATUSES } from "../fields";
import type { Bill } from "../types";
import { autoMap, decodeText, findHeaderRow, guessType, NEW_FIELD, parseDate, parseDateRange, parseDelimited, planImport, readTables } from "./import";

const enc = (s: string) => new TextEncoder().encode(s);
const ctx = { fieldDefs: DEFAULT_FIELDS, statuses: DEFAULT_STATUSES, existing: [] as Bill[], skipDuplicates: true };

describe("delimited text", () => {
  it("handles quotes, escaped quotes, embedded newlines and CRLF", () => {
    expect(parseDelimited('a,b\r\n"x, y","say ""hi"""\r\n"multi\nline",2\r\n')).toEqual([["a", "b"], ["x, y", 'say "hi"'], ["multi\nline", "2"]]);
  });
  it("sniffs tabs and semicolons", () => {
    expect(parseDelimited("a\tb\tc\n1\t2\t3")).toEqual([["a", "b", "c"], ["1", "2", "3"]]);
    expect(parseDelimited("a;b\n1,5;2")).toEqual([["a", "b"], ["1,5", "2"]]);
  });
  it("decodes UTF-16 and Windows-1252", () => {
    const u16 = new Uint8Array([0xff, 0xfe, ...[..."hé"].flatMap((c) => [c.charCodeAt(0), 0])]);
    expect(decodeText(u16)).toBe("hé");
    expect(decodeText(new Uint8Array([0x63, 0x61, 0x66, 0xe9]))).toBe("café");
  });
});

describe("dates", () => {
  it("parses the usual export formats", () => {
    expect(parseDate("2024-03-05")).toBe("2024-03-05");
    expect(parseDate("2024-03-05T10:00:00Z")).toBe("2024-03-05");
    expect(parseDate("3/5/2024")).toBe("2024-03-05");
    expect(parseDate("03/05/24")).toBe("2024-03-05");
    expect(parseDate("25/12/2024")).toBe("2024-12-25");
    expect(parseDate("Mar 5, 2024")).toBe("2024-03-05");
    expect(parseDate("Tuesday, March 5th 2024")).toBe("2024-03-05");
    expect(parseDate("05-Mar-2024")).toBe("2024-03-05");
    expect(parseDate("20240305")).toBe("2024-03-05");
    expect(parseDate(45356)).toBe("2024-03-05");
    expect(parseDate("2/30/2024")).toBeNull();
    expect(parseDate("Dr. Smith")).toBeNull();
  });
  it("splits ranges", () => {
    expect(parseDateRange("01/02/2024 - 01/05/2024")).toEqual(["2024-01-02", "2024-01-05"]);
    expect(parseDateRange("01/02/2024-01/05/2024")).toEqual(["2024-01-02", "2024-01-05"]);
    expect(parseDateRange("Jan 2, 2024 to Jan 5, 2024")).toEqual(["2024-01-02", "2024-01-05"]);
    expect(parseDateRange("01-02-2024")).toEqual(["2024-01-02", null]);
  });
});

describe("mapping", () => {
  it("recognises insurer headings", () => {
    const m = autoMap(["Patient", "Date of Service", "Provider", "Claim #", "Amount Billed", "Plan Paid", "You May Owe", "Claim Status", "Notes"], DEFAULT_FIELDS);
    expect(m).toEqual(["memberName", "from", "providerName", "claimNumber", "claimTotal", "paidByPlan", "yourResponsibility", "status", null]);
  });
  it("uses each field once", () => {
    expect(autoMap(["Billed", "Total Charges"], DEFAULT_FIELDS)).toEqual(["claimTotal", null]);
  });
  it("skips a title block to find the header", () => {
    const rows = [["Claims for Jane Doe", null], ["Exported 2024-05-01", null], [], ["Date", "Provider", "Billed"], ["1/2/2024", "Dr A", "$10.00"]];
    expect(findHeaderRow(rows, DEFAULT_FIELDS)).toBe(3);
  });
  it("guesses types for new fields", () => {
    expect(guessType("Check Date", ["1/2/2024", "2024-03-01"])).toBe("date");
    expect(guessType("Allowed Amount", ["10", "12.5"])).toBe("money");
    expect(guessType("Units", [1, 2])).toBe("number");
    expect(guessType("Notes", ["x", "1"])).toBe("text");
  });
});

describe("planImport", () => {
  const table = {
    name: "t",
    rows: [
      ["Service Dates", "Provider", "Claim Number", "Billed", "You Owe", "Status", "Allowed"],
      ["01/02/2024 - 01/05/2024", "City Hospital", "0012", "$1,200.00", "(15.50)", "paid", "900"],
      ["", "", "", "", "", "", ""],
      ["2/3/24", "Dr Who", "0013", "300", "0", "In Process", ""],
      ["Total", "", "", "1500", "15.50", "", ""],
    ],
  };
  const mapping = [...autoMap(table.rows[0], DEFAULT_FIELDS).slice(0, 6), NEW_FIELD];

  it("converts cells and skips blank and total rows", () => {
    expect(mapping.slice(0, 6)).toEqual(["from", "providerName", "claimNumber", "claimTotal", "yourResponsibility", "status"]);
    const p = planImport(table, 0, mapping, ctx);
    expect(p.rows).toHaveLength(2);
    expect(p.rows[0]).toMatchObject({ from: "2024-01-02", to: "2024-01-05", providerName: "City Hospital", claimNumber: "0012", claimTotal: 120000, yourResponsibility: -1550, status: "Paid" });
    expect(p.rows[1]).toMatchObject({ from: "2024-02-03", status: "In Process", yourResponsibility: 0 });
    expect(p.newStatuses).toEqual(["In Process"]);
    expect(p.newFields).toMatchObject([{ label: "Allowed", type: "money", group: "Custom" }]);
    expect(p.rows[0][p.newFields[0].key]).toBe(90000);
  });

  it("skips bills already imported", () => {
    const first = planImport(table, 0, mapping, ctx);
    const existing = first.rows.map((values) => ({ values }) as Bill);
    const again = planImport(table, 0, mapping, { ...ctx, existing });
    expect(again.rows).toHaveLength(0);
    expect(again.duplicates).toBe(2);
  });
});

describe("readTables", () => {
  it("reads xlsx with real date cells", async () => {
    const ws = XLSX.utils.aoa_to_sheet([["Date of Service", "Provider", "Billed"], [new Date(2024, 2, 5), "Dr A", 12.5]], { cellDates: true });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Claims");
    const bytes = new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
    const [t] = await readTables(bytes, "claims.xlsx");
    expect(t.name).toBe("Claims");
    expect(t.rows[1]).toEqual(["2024-03-05", "Dr A", 12.5]);
  });

  it("reads a FHIR ExplanationOfBenefit bundle", async () => {
    const bundle = {
      resourceType: "Bundle",
      entry: [{
        resource: {
          resourceType: "ExplanationOfBenefit", id: "x1", outcome: "complete",
          identifier: [{ value: "C-1" }], billablePeriod: { start: "2024-04-01", end: "2024-04-02" },
          patient: { display: "Jane" }, provider: { display: "Clinic" },
          total: [
            { category: { coding: [{ code: "submitted" }] }, amount: { value: 200 } },
            { category: { coding: [{ code: "benefit" }] }, amount: { value: 150 } },
            { category: { coding: [{ system: "carin", code: "memberliability" }] }, amount: { value: 50 } },
          ],
        },
      }],
    };
    const [t] = await readTables(enc(JSON.stringify(bundle)), "eob.json");
    const p = planImport(t, findHeaderRow(t.rows, DEFAULT_FIELDS), autoMap(t.rows[0], DEFAULT_FIELDS), ctx);
    expect(p.rows[0]).toMatchObject({ from: "2024-04-01", to: "2024-04-02", memberName: "Jane", providerName: "Clinic", claimNumber: "C-1",
      claimTotal: 20000, paidByPlan: 15000, yourResponsibility: 5000, status: "Processed" });
  });

  it("rejects unknown formats", async () => {
    await expect(readTables(enc("x"), "scan.pdf")).rejects.toThrow(/Can't import \.pdf/);
  });
});
