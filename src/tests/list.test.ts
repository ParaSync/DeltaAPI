import { describe, expect, test } from "@jest/globals";
import { randomUUID } from "crypto";

const route = (s: string) => `http://localhost:3000/${s}`;

const buildFormPayload = () => ({
  title: `List Test Form ${Date.now()}`,
  userId: "892d56fa-50c6-43b3-86e9-f162329760a1", // use userId to match API
  components: [
    {
      type: "text",
      name: "full_name",
      order: 2,
      properties: { label: "Full Name", required: true },
    },
    {
      type: "select",
      name: "department",
      order: 1,
      properties: {
        label: "Department",
        options: ["Sales", "Marketing", "Support"],
      },
    },
  ],
});

const createForm = async () => {
  const response = await fetch(route("api/form/create"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildFormPayload()),
  });
  const json = await response.json();
  return { response, json };
};

describe("Form Listing Route", () => {
  test("returns forms including newly created form", async () => {
    const { response, json } = await createForm();
    expect(response.status).toBe(201);

    const createdForm = json?.value ?? json; // adapt to { message, value }
    const createdId = createdForm?.id;
    expect(typeof createdId).toBe("string");

    const listResponse = await fetch(route("api/form/list"));
    expect(listResponse.status).toBe(200);

    const listJson = await listResponse.json();
    const forms = listJson?.value?.forms ?? listJson?.forms ?? [];
    expect(Array.isArray(forms)).toBe(true);
    expect(forms.some((form: any) => form.id === createdId)).toBe(true);
  });

  test("returns components ordered by their order property", async () => {
    const { response, json } = await createForm();
    expect(response.status).toBe(201);

    const createdForm = json?.value ?? json;
    const createdId = createdForm?.id;

    const listResponse = await fetch(route("api/form/list"));
    const listJson = await listResponse.json();
    const forms = listJson?.value?.forms ?? listJson?.forms ?? [];

    const target = forms.find((form: any) => form.id === createdId);
    expect(target).toBeTruthy();
    expect(Array.isArray(target.components)).toBe(true);
    expect(target.components.length).toBeGreaterThan(0);

    const orders = target.components.map(
      (component: any) =>
        // components may store order either directly or inside properties.order
        component.order ??
        component.properties?.order ??
        (component.properties?.properties?.order ?? 0)
    );
    const sortedOrders = [...orders].sort((a, b) => a - b);
    expect(orders).toEqual(sortedOrders);
  });
});