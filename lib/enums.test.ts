import { describe, expect, it } from "vitest";
import {
  ActivityCategorySchema,
  AuthorshipSchema,
  parseEnumArray,
  parseIntArray,
  parseJson,
  parseStringArray,
  serializeArray,
} from "@/lib/enums";
import { z } from "zod";

describe("parseStringArray", () => {
  it("returns [] for null/undefined/empty", () => {
    expect(parseStringArray(null)).toEqual([]);
    expect(parseStringArray(undefined)).toEqual([]);
    expect(parseStringArray("")).toEqual([]);
  });

  it("returns [] for malformed JSON", () => {
    expect(parseStringArray("{not json")).toEqual([]);
    expect(parseStringArray("not-an-array")).toEqual([]);
  });

  it("filters out non-string entries", () => {
    expect(parseStringArray('["a", 1, "b", null, true]')).toEqual(["a", "b"]);
  });

  it("parses a valid string array", () => {
    expect(parseStringArray('["x","y","z"]')).toEqual(["x", "y", "z"]);
  });

  it("returns [] when the JSON is an object, not an array", () => {
    expect(parseStringArray('{"a":1}')).toEqual([]);
  });
});

describe("parseIntArray", () => {
  it("returns [] for null/empty/malformed", () => {
    expect(parseIntArray(null)).toEqual([]);
    expect(parseIntArray("")).toEqual([]);
    expect(parseIntArray("oops")).toEqual([]);
  });

  it("keeps only finite numbers", () => {
    expect(parseIntArray('[9, 10, "11", null, 12]')).toEqual([9, 10, 12]);
  });

  it("parses a valid number array", () => {
    expect(parseIntArray("[9,10,11,12]")).toEqual([9, 10, 11, 12]);
  });
});

describe("parseEnumArray", () => {
  it("returns [] for null/empty", () => {
    expect(parseEnumArray(null, ActivityCategorySchema)).toEqual([]);
    expect(parseEnumArray("", ActivityCategorySchema)).toEqual([]);
  });

  it("keeps only valid enum members", () => {
    expect(
      parseEnumArray('["RESEARCH","BOGUS","LEADERSHIP"]', ActivityCategorySchema),
    ).toEqual(["RESEARCH", "LEADERSHIP"]);
  });

  it("validates against a different enum (authorship)", () => {
    expect(
      parseEnumArray('["FIRST","nope","SOLE"]', AuthorshipSchema),
    ).toEqual(["FIRST", "SOLE"]);
  });

  it("returns [] on malformed JSON", () => {
    expect(parseEnumArray("###", ActivityCategorySchema)).toEqual([]);
  });
});

describe("serializeArray", () => {
  it("serializes a string array round-trippable with parseStringArray", () => {
    const json = serializeArray(["a", "b"]);
    expect(json).toBe('["a","b"]');
    expect(parseStringArray(json)).toEqual(["a", "b"]);
  });

  it("serializes an empty array", () => {
    expect(serializeArray([])).toBe("[]");
  });

  it("round-trips number arrays with parseIntArray", () => {
    expect(parseIntArray(serializeArray([9, 10, 11]))).toEqual([9, 10, 11]);
  });
});

describe("parseJson", () => {
  const schema = z.object({ a: z.number(), b: z.string() });
  const fallback = { a: 0, b: "" };

  it("returns fallback for null/empty", () => {
    expect(parseJson(null, schema, fallback)).toEqual(fallback);
    expect(parseJson("", schema, fallback)).toEqual(fallback);
  });

  it("returns fallback for malformed JSON", () => {
    expect(parseJson("{bad", schema, fallback)).toEqual(fallback);
  });

  it("returns fallback when shape does not validate", () => {
    expect(parseJson('{"a":"wrong"}', schema, fallback)).toEqual(fallback);
  });

  it("parses valid JSON matching the schema", () => {
    expect(parseJson('{"a":1,"b":"hi"}', schema, fallback)).toEqual({ a: 1, b: "hi" });
  });
});
