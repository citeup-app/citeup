/**
 * Shared email styles for rentail.space
 * Using consistent design system across all transactional emails
 */

export const colors = {
  // Brand colors
  primary: "#4f46e5", // Indigo-600
  primaryHover: "#4338ca", // Indigo-700

  // Text colors
  text: "#374151", // Gray-700
  textDark: "#1f2937", // Gray-800
  textLight: "#6b7280", // Gray-500

  // Background colors
  background: "#f6f9fc", // Light blue-gray
  white: "#ffffff",
  highlightBg: "#f3f4f6", // Gray-100

  // Border colors
  border: "#e5e7eb", // Gray-200
  borderLight: "#f0f0f0",
};

export const fontFamily =
  '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif';

export const main = {
  backgroundColor: colors.background,
  fontFamily,
};

export const container = {
  backgroundColor: colors.white,
  border: `1px solid ${colors.borderLight}`,
  borderRadius: "8px",
  margin: "40px auto",
  padding: "40px",
  maxWidth: "600px",
};

export const logo = {
  margin: "0 auto 32px",
  display: "block",
};

export const heading = {
  color: colors.textDark,
  fontSize: "28px",
  fontWeight: "700",
  lineHeight: "1.3",
  margin: "0 0 24px",
  textAlign: "center" as const,
};

export const text = {
  color: colors.text,
  fontSize: "16px",
  lineHeight: "1.6",
  margin: "16px 0",
};

export const highlightBox = {
  backgroundColor: colors.highlightBg,
  borderRadius: "6px",
  padding: "20px",
  margin: "24px 0",
};

export const highlightText = {
  color: colors.textDark,
  fontSize: "15px",
  lineHeight: "1.8",
  margin: "0",
};

export const buttonContainer = {
  margin: "32px 0",
  textAlign: "center" as const,
};

export const button = {
  backgroundColor: colors.primary,
  borderRadius: "6px",
  color: colors.white,
  display: "inline-block",
  fontSize: "16px",
  fontWeight: "600",
  lineHeight: "1",
  padding: "14px 28px",
  textDecoration: "none",
  textAlign: "center" as const,
};

export const link = {
  color: colors.primary,
  textDecoration: "underline",
};

export const code = {
  backgroundColor: colors.highlightBg,
  borderRadius: "4px",
  color: colors.textDark,
  fontSize: "14px",
  fontFamily: "monospace",
  padding: "12px",
  wordBreak: "break-all" as const,
};

export const footer = {
  borderTop: `1px solid ${colors.border}`,
  marginTop: "32px",
  paddingTop: "24px",
};

export const footerText = {
  color: colors.textLight,
  fontSize: "14px",
  lineHeight: "1.5",
  margin: "8px 0",
  textAlign: "center" as const,
};

export const footerLink = {
  color: colors.textLight,
  textDecoration: "underline",
};
