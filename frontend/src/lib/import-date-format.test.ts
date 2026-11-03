import {
  dateValuesFromTable,
  detectDateFormat,
  formatsForDateValue,
  parseCsv,
} from "@/lib/import-date-format";

describe("import date detection", () => {
  it("detects dotted, ISO, dashed, and Excel serial columns", () => {
    expect(detectDateFormat(["14.03.2015", "01.12.1999", ""])).toEqual({
      status: "detected",
      format: "DD.MM.YYYY",
      candidates: ["DD.MM.YYYY"],
    });
    expect(detectDateFormat(["2015-03-14", "1999-12-01"])).toEqual({
      status: "detected",
      format: "YYYY-MM-DD",
      candidates: ["YYYY-MM-DD"],
    });
    expect(detectDateFormat(["14-03-2015", "01-12-1999"])).toEqual({
      status: "detected",
      format: "DD-MM-YYYY",
      candidates: ["DD-MM-YYYY"],
    });
    expect(detectDateFormat(["36526", "42077.0", "43831"])).toEqual({
      status: "detected",
      format: "EXCEL",
      candidates: ["EXCEL"],
    });
  });

  it("uses a later unambiguous value to choose day-first or month-first slashes", () => {
    expect(detectDateFormat(["08/11/1973", "31/12/2025", "01/02/2010"])).toEqual({
      status: "detected",
      format: "DD/MM/YYYY",
      candidates: ["DD/MM/YYYY"],
    });
    expect(detectDateFormat(["11/08/1973", "12/31/2025", "02/01/2010"])).toEqual({
      status: "detected",
      format: "MM/DD/YYYY",
      candidates: ["MM/DD/YYYY"],
    });
  });

  it("asks for a format only when every value could be either day or month first", () => {
    const detection = detectDateFormat(["01/02/2010", "03/04/2011", "11/12/2012"]);
    expect(detection.status).toBe("ambiguous");
    expect(detection.format).toBeNull();
    expect(detection.candidates).toEqual(["DD/MM/YYYY", "MM/DD/YYYY"]);
  });

  it("does not treat a column of calendar years as Excel serials", () => {
    expect(detectDateFormat(["1998", "2004", "2015"])).toEqual({
      status: "empty",
      format: null,
      candidates: [],
    });
  });

  it("ignores blank cells and still detects the column", () => {
    expect(formatsForDateValue(" 14.03.2015 ")).toEqual(["DD.MM.YYYY"]);
    expect(detectDateFormat(["", "14.03.2015", "   "]).format).toBe("DD.MM.YYYY");
  });

  it("analyses every value in the date columns, not only the first rows", () => {
    const headers = ["Name", "Date of Birth", "Membership End Date"];
    const rows = [
      ["Ada", "01/02/2010", "31/12/2024"],
      ["Ben", "03/04/2011", "01/06/2025"],
      ["Cam", "13/05/2012", "15/08/2026"],
    ];
    expect(dateValuesFromTable(headers, rows)).toEqual([
      "01/02/2010",
      "31/12/2024",
      "03/04/2011",
      "01/06/2025",
      "13/05/2012",
      "15/08/2026",
    ]);
    expect(detectDateFormat(dateValuesFromTable(headers, rows)).format).toBe("DD/MM/YYYY");
  });

  it("reads every data row from a quoted CSV", () => {
    const table = parseCsv(
      '\uFEFF"Date of Birth","Name"\n"01/02/2010","Ada"\n"13/04/2011","Ben"\n'
    );
    expect(table[0]).toEqual(["Date of Birth", "Name"]);
    const dates = table.slice(1).map((row) => row[0]);
    expect(detectDateFormat(dates).format).toBe("DD/MM/YYYY");
  });
});
