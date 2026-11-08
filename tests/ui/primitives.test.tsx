import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/table";
import { Alert, EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { Progress, Stat } from "@/components/ui/stat";
import { Avatar } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import { Tabs, TabPanel } from "@/components/ui/tabs";
import { Fieldset, Field, SelectField } from "@/components/ui/form";
import { ConfirmDialog } from "@/components/ui/dialog";
import { NextIntlClientProvider } from "next-intl";

type Row = { id: string; name: string };

const columns: Array<Column<Row>> = [
  { key: "name", header: "Member", cell: (row) => row.name },
];

describe("button", () => {
  it("defaults to type=button and exposes its variant and size", () => {
    const html = renderToStaticMarkup(<Button variant="primary">Save</Button>);
    expect(html).toContain('type="button"');
    expect(html).toContain('data-variant="primary"');
    expect(html).toContain('data-size="md"');
    expect(html).toContain("ui-button");
    expect(html).toContain("Save");
  });

  it("marks a busy submit control", () => {
    const html = renderToStaticMarkup(
      <Button type="submit" aria-busy>
        Saving
      </Button>,
    );
    expect(html).toContain('type="submit"');
    expect(html).toContain('aria-busy="true"');
  });
});

describe("badge and icon", () => {
  it("renders text plus a decorative icon, so tone is never the only meaning", () => {
    const html = renderToStaticMarkup(
      <Badge tone="danger" icon="alert">
        Absent
      </Badge>,
    );
    expect(html).toContain('data-tone="danger"');
    expect(html).toContain("Absent");
    expect(html).toContain('aria-hidden="true"');
  });

  it("gives an icon an accessible name only when a title is supplied", () => {
    const decorative = renderToStaticMarkup(<Icon name="check" />);
    expect(decorative).toContain('aria-hidden="true"');
    expect(decorative).not.toContain("<title>");

    const labelled = renderToStaticMarkup(<Icon name="check" title="Present" />);
    expect(labelled).toContain('role="img"');
    expect(labelled).toContain("<title>Present</title>");
    expect(labelled).not.toContain('aria-hidden="true"');
  });
});

describe("cards and page headers", () => {
  it("ties a card section to its heading", () => {
    const html = renderToStaticMarkup(
      <Card labelledBy="members-title">
        <CardHeader title="Members" titleId="members-title" />
      </Card>,
    );
    expect(html).toContain("<section");
    expect(html).toContain('aria-labelledby="members-title"');
    expect(html).toContain('<h2 class="ui-card-title" id="members-title">Members</h2>');
  });

  it("renders one h1 with an optional description and actions", () => {
    const html = renderToStaticMarkup(
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        description="Only real records."
        actions={<Button>Settings</Button>}
      />,
    );
    expect((html.match(/<h1/g) ?? []).length).toBe(1);
    expect(html).toContain("Dashboard");
    expect(html).toContain("Only real records.");
    expect(html).toContain("Settings");
  });
});

describe("feedback", () => {
  it("uses the correct live-region role for an alert", () => {
    const danger = renderToStaticMarkup(
      <Alert tone="danger" live="alert">
        Could not save.
      </Alert>,
    );
    expect(danger).toContain('role="alert"');
    expect(danger).toContain('data-tone="danger"');

    const success = renderToStaticMarkup(
      <Alert tone="success" live="status">
        Saved.
      </Alert>,
    );
    expect(success).toContain('role="status"');
    expect(success).toContain('data-tone="success"');
  });

  it("renders empty and error states with text, not colour alone", () => {
    const empty = renderToStaticMarkup(
      <EmptyState title="No members" description="Invite an assistant." />,
    );
    expect(empty).toContain("No members");
    expect(empty).toContain("Invite an assistant.");

    const error = renderToStaticMarkup(<ErrorState title="Could not load" />);
    expect(error).toContain('role="alert"');
    expect(error).toContain("Could not load");
  });

  it("hides skeletons from assistive technology", () => {
    const html = renderToStaticMarkup(<Skeleton width="10rem" />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("inline-size:10rem");
  });
});

describe("data table", () => {
  it("renders a caption, column headers, and one row per record", () => {
    const html = renderToStaticMarkup(
      <DataTable
        caption="Workspace members"
        scrollLabel="Workspace members table"
        columns={columns}
        rows={[{ id: "1", name: "Mona" }]}
        rowKey={(row) => row.id}
        empty="No members"
      />,
    );
    expect(html).toContain("Workspace members");
    expect(html).toContain("<caption");
    expect(html).toContain('scope="col"');
    expect(html).toContain("Mona");
    expect(html).toContain('role="region"');
    expect(html).toContain('aria-label="Workspace members table"');
  });

  it("renders the empty state instead of an empty table when there are no rows", () => {
    const html = renderToStaticMarkup(
      <DataTable
        caption="Workspace members"
        scrollLabel="Workspace members table"
        columns={columns}
        rows={[]}
        rowKey={(row) => row.id}
        empty="No members yet"
      />,
    );
    expect(html).toContain("No members yet");
    expect(html).not.toContain("<table");
  });
});

describe("stat, progress, and avatar", () => {
  it("exposes progress as a real progressbar with a clamped value", () => {
    const html = renderToStaticMarkup(
      <Progress value={140} label="Setup progress" />,
    );
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="100"');
    expect(html).toContain('aria-label="Setup progress"');
  });

  it("renders a stat label, value, and hint", () => {
    const html = renderToStaticMarkup(
      <Stat label="Members" value={3} hint="Active members" icon="users" />,
    );
    expect(html).toContain("ui-stat-label");
    expect(html).toContain("Members");
    expect(html).toContain("3");
    expect(html).toContain("Active members");
  });

  it("renders an interactive stat as a pressed-state button", () => {
    const html = renderToStaticMarkup(
      <Stat
        label="Active"
        value={12}
        hint="60% of listed students"
        icon="checkCircle"
        tone="success"
        pressed
        onClick={() => {}}
      />,
    );
    expect(html).toContain("<button");
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('data-interactive="true"');
    expect(html).toContain('data-tone="success"');
  });

  it("renders the inverted composition without changing the value", () => {
    const html = renderToStaticMarkup(
      <Stat label="Total students" value={20} variant="invert" />,
    );
    expect(html).toContain('data-variant="invert"');
    expect(html).toContain("Total students");
    expect(html).toContain("20");
  });

  it("renders avatar initials and a deterministic tone", () => {
    const html = renderToStaticMarkup(<Avatar name="Mona Ahmed" />);
    expect(html).toContain("MA");
    expect(html).toContain("data-tone=");
    expect(html).toContain('aria-hidden="true"');
  });
});

describe("tabs", () => {
  it("renders tab triggers and active panel", () => {
    const html = renderToStaticMarkup(
      <Tabs
        label="Account settings"
        defaultValue="profile"
        items={[
          { value: "profile", label: "Profile" },
          { value: "security", label: "Security" },
        ]}
      >
        <TabPanel value="profile">Profile content</TabPanel>
        <TabPanel value="security">Security content</TabPanel>
      </Tabs>,
    );
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-label="Account settings"');
    expect(html).toContain('role="tab"');
    expect(html).toContain("Profile");
    expect(html).toContain("Security");
    expect(html).toContain("Profile content");
  });
});

describe("form primitives", () => {
  it("renders fieldset with legend and hint", () => {
    const html = renderToStaticMarkup(
      <Fieldset legend="Workspace profile" hint="Shown to students and parents">
        <input name="test" />
      </Fieldset>,
    );
    expect(html).toContain("<fieldset");
    expect(html).toContain("ui-fieldset");
    expect(html).toContain("<legend");
    expect(html).toContain("Workspace profile");
    expect(html).toContain("Shown to students and parents");
  });

  it("renders field with label, input, and hint", () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" timeZone="UTC" messages={{}}>
        <Field
          label="Teaching name"
          name="teachingName"
          hint="For example: Mr. Ahmed"
          required
        />
      </NextIntlClientProvider>,
    );
    expect(html).toContain("ui-field");
    expect(html).toContain('for="teachingName"');
    expect(html).toContain("Teaching name");
    expect(html).toContain('aria-required="true"');
    expect(html).toContain('name="teachingName"');
    expect(html).toContain("For example: Mr. Ahmed");
  });

  it("renders select field with options and caret", () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" timeZone="UTC" messages={{}}>
        <SelectField
          label="Subject"
          name="primarySubject"
          options={[
            { value: "math", label: "Mathematics" },
            { value: "physics", label: "Physics" },
          ]}
        />
      </NextIntlClientProvider>,
    );
    expect(html).toContain("ui-select");
    expect(html).toContain("Mathematics");
    expect(html).toContain("Physics");
    expect(html).toContain('name="primarySubject"');
  });
});

describe("dialogs", () => {
  it("renders trigger for confirm dialog", () => {
    const html = renderToStaticMarkup(
      <ConfirmDialog
        trigger={<Button variant="danger">Delete workspace</Button>}
        title="Delete workspace"
        description="This action cannot be undone."
        confirmLabel="Yes, delete"
        cancelLabel="Cancel"
        closeLabel="Close"
        action={() => {}}
      />,
    );
    expect(html).toContain("Delete workspace");
    expect(html).toContain('data-variant="danger"');
    expect(html).toContain('aria-haspopup="dialog"');
  });
});
