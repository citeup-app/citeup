import { Button, CodeInline, Section, Text } from "@react-email/components";
import EmailLayout from "./EmailLayout";
import { sendEmail } from "./sendEmails.server";
import * as styles from "./styles";

export default async function sendEmailVerificationEmail({
  to,
  url,
}: {
  to: string;
  url: string;
}) {
  await sendEmail({
    to,
    subject: "Verify your email address for rentail.space",
    render: ({ subject }) => <EmailVerification subject={subject} url={url} />,
  });
}

function EmailVerification({
  subject,
  url: verificationUrl,
}: {
  subject: string;
  url: string;
}) {
  return (
    <EmailLayout subject={subject}>
      <Text style={styles.text}>Hello there,</Text>

      <Text style={styles.text}>
        You recently requested to change your email address on rentail.space. To
        complete this change, please verify your new email address by clicking
        the button below.
      </Text>

      <Section style={styles.buttonContainer}>
        <Button href={verificationUrl} style={styles.button}>
          Verify Email Address
        </Button>
      </Section>

      <Text style={styles.text}>
        Or copy and paste this link into your browser:
      </Text>

      <CodeInline style={styles.code}>{verificationUrl}</CodeInline>

      <Text style={styles.text}>
        This link will expire in 24 hours. If you didn't request this change,
        you can safely ignore this email.
      </Text>

      <Text style={styles.text}>
        Best regards,
        <br />
        The CiteUp Team
      </Text>
    </EmailLayout>
  );
}
