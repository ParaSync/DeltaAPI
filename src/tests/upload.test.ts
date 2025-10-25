import { describe, expect, test } from "@jest/globals";

const route = (s: string) => `http://localhost:3000/${s}`;

describe("Upload Route", () => {
  test("uploads an image and returns public URL", async () => {
    const formData = new FormData();
    const fileContents = new Blob(["dummy image content"], { type: "image/png" });

    formData.append("file", fileContents, "test.png");

    const response = await fetch(route("upload"), {
      method: "POST",
      body: formData,
    });

    expect(response.status).toBe(200);

    const json = await response.json();

    expect(json).toHaveProperty("src");
    expect(json).toHaveProperty("filename");
    expect(json.message).toBe("Upload successful");
  });

  test("rejects unsupported file type", async () => {
    const formData = new FormData();
    formData.append("file", new Blob(["text content"], { type: "text/plain" }), "readme.txt");

    const response = await fetch(route("upload"), {
      method: "POST",
      body: formData,
    });

    expect(response.status).toBe(400);

    const json = await response.json();

    expect(json.error).toBe("Invalid file type");
  });
});