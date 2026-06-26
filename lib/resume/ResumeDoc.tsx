import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

import type { ResumeData, ResumeActivity } from "@/lib/types";

const styles = StyleSheet.create({
  page: {
    paddingVertical: 40,
    paddingHorizontal: 48,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#1a1a1a",
    lineHeight: 1.4,
  },
  name: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  contactLine: {
    fontSize: 9.5,
    color: "#444444",
    marginBottom: 2,
  },
  section: {
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 1,
    borderBottomWidth: 1,
    borderBottomColor: "#cccccc",
    paddingBottom: 3,
    marginBottom: 6,
  },
  academicRow: {
    fontSize: 10,
    marginBottom: 2,
  },
  academicLabel: {
    fontFamily: "Helvetica-Bold",
  },
  activity: {
    marginBottom: 10,
  },
  activityHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  activityTitle: {
    fontSize: 10.5,
    fontFamily: "Helvetica-Bold",
  },
  activityDates: {
    fontSize: 9.5,
    color: "#555555",
  },
  activityMeta: {
    fontSize: 9.5,
    color: "#555555",
    marginBottom: 2,
  },
  activityDescription: {
    fontSize: 10,
    marginTop: 1,
  },
  researchLine: {
    fontSize: 9.5,
    color: "#333333",
    marginTop: 2,
    fontFamily: "Helvetica-Oblique",
  },
  emptyNote: {
    fontSize: 10,
    color: "#777777",
    fontFamily: "Helvetica-Oblique",
  },
});

function buildContactLine(data: ResumeData): string {
  const parts: string[] = [];
  if (data.gradeLevel !== null) parts.push(`Grade ${data.gradeLevel}`);
  if (data.gradYear !== null) parts.push(`Class of ${data.gradYear}`);
  if (data.intendedMajor) parts.push(`Intended Major: ${data.intendedMajor}`);
  if (data.state) parts.push(data.state);
  return parts.join("  •  ");
}

function buildAcademicRows(data: ResumeData): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  if (data.gpaUnweighted !== null) {
    rows.push({ label: "GPA (Unweighted)", value: data.gpaUnweighted.toFixed(2) });
  }
  if (data.gpaWeighted !== null) {
    rows.push({ label: "GPA (Weighted)", value: data.gpaWeighted.toFixed(2) });
  }
  if (data.satTotal !== null) {
    rows.push({ label: "SAT", value: String(data.satTotal) });
  }
  if (data.actComposite !== null) {
    rows.push({ label: "ACT", value: String(data.actComposite) });
  }
  if (data.rigor) {
    rows.push({ label: "Course Rigor", value: data.rigor });
  }
  return rows;
}

function buildResearchLine(research: ResumeActivity["research"]): string | null {
  if (!research) return null;
  const parts: string[] = [research.outputType, research.authorship];
  if (research.venue) parts.push(research.venue);
  return `Research: ${parts.join(" • ")}`;
}

function ActivityEntry({ activity }: { activity: ResumeActivity }) {
  const metaParts: string[] = [activity.category];
  if (activity.role) metaParts.unshift(activity.role);
  const researchLine = buildResearchLine(activity.research);

  return (
    <View style={styles.activity} wrap={false}>
      <View style={styles.activityHeader}>
        <Text style={styles.activityTitle}>{activity.title}</Text>
        {activity.dates ? (
          <Text style={styles.activityDates}>{activity.dates}</Text>
        ) : null}
      </View>
      <Text style={styles.activityMeta}>{metaParts.join(" — ")}</Text>
      {activity.description ? (
        <Text style={styles.activityDescription}>{activity.description}</Text>
      ) : null}
      {researchLine ? (
        <Text style={styles.researchLine}>{researchLine}</Text>
      ) : null}
    </View>
  );
}

export function ResumeDoc({ data }: { data: ResumeData }) {
  const contactLine = buildContactLine(data);
  const academicRows = buildAcademicRows(data);
  const documentTitle = data.name ? `${data.name} — Resume` : "Resume";

  return (
    <Document title={documentTitle}>
      <Page size="LETTER" style={styles.page}>
        <View>
          <Text style={styles.name}>{data.name ?? "Student Resume"}</Text>
          {contactLine ? (
            <Text style={styles.contactLine}>{contactLine}</Text>
          ) : null}
          {data.email ? (
            <Text style={styles.contactLine}>{data.email}</Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Academics</Text>
          {academicRows.length > 0 ? (
            academicRows.map((row) => (
              <Text key={row.label} style={styles.academicRow}>
                <Text style={styles.academicLabel}>{row.label}: </Text>
                {row.value}
              </Text>
            ))
          ) : (
            <Text style={styles.emptyNote}>No academic information entered.</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Activities</Text>
          {data.activities.length > 0 ? (
            data.activities.map((activity, index) => (
              <ActivityEntry key={index} activity={activity} />
            ))
          ) : (
            <Text style={styles.emptyNote}>No activities entered yet.</Text>
          )}
        </View>
      </Page>
    </Document>
  );
}
