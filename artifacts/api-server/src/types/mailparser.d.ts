declare module "mailparser" {
  export type ParsedMail = {
    subject?: string;
    date?: Date;
    text?: string;
    html?: string | false;
    from?: { value?: Array<{ name?: string; address?: string }> };
    attachments: Array<{
      filename?: string;
      contentType: string;
      content: Buffer;
      size: number;
      contentDisposition?: string;
    }>;
  };
  export function simpleParser(source: Buffer | Uint8Array): Promise<ParsedMail>;
}
