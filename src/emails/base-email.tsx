import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

// Shared chrome for all outgoing CRM emails. Body content is the composed
// (already merge-var-rendered) HTML.
export function BaseEmail({ previewText, bodyHtml }: { previewText: string; bodyHtml: string }) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={{ backgroundColor: "#f4f4f5", fontFamily: "Arial, Helvetica, sans-serif" }}>
        <Container
          style={{
            backgroundColor: "#ffffff",
            borderRadius: 8,
            margin: "24px auto",
            padding: "32px",
            maxWidth: 560,
          }}
        >
          <Section>
            <Text style={{ fontSize: 20, fontWeight: 700, color: "#18181b", margin: 0 }}>
              Perx
            </Text>
          </Section>
          <Hr style={{ borderColor: "#e4e4e7", margin: "16px 0" }} />
          <div
            style={{ fontSize: 14, lineHeight: "22px", color: "#3f3f46" }}
            dangerouslySetInnerHTML={{ __html: bodyHtml }}
          />
          <Hr style={{ borderColor: "#e4e4e7", margin: "24px 0 12px" }} />
          <Text style={{ fontSize: 11, color: "#a1a1aa", margin: 0 }}>
            Perx Technologies · Malé, Maldives
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
