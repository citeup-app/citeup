import { Button, CodeInline, Section, Text } from "@react-email/components";
import EmailLayout from "./EmailLayout";
import { sendEmail } from "./sendEmails.server";
import * as styles from "./styles";

export default async function sendPasswordRecoveryEmail({
  to,
  url,
}: {
  to: string;
  url: string;
}) {
  await sendEmail({
    to,
    subject: "Reset your CiteUp password",
    render: ({ subject }) => <PasswordRecovery subject={subject} url={url} />,
  });
}

function PasswordRecovery({
  subject,
  url: resetPasswordUrl,
}: {
  subject: string;
  url: string;
}) {
  return (
    <EmailLayout subject={subject}>
      <Text style={styles.text}>Hello there,</Text>

      <Text style={styles.text}>
        You recently requested to reset your CiteUp password. To complete this
        request, please click the button below.
      </Text>

      <Section style={styles.buttonContainer}>
        <Button href={resetPasswordUrl} style={styles.button}>
          Reset Password
        </Button>
      </Section>

      <Text style={styles.text}>
        Or copy and paste this link into your browser:
      </Text>

      <CodeInline style={styles.code}>{resetPasswordUrl}</CodeInline>

      <Text style={styles.text}>
        This link will expire in 30 minutes. If you didn't request this change,
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
