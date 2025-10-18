interface LegacyRowInput {
  userId: string;
  kind: string;
  messageId?: string;
  note?: string;
}

export async function appendRow(row: LegacyRowInput): Promise<void> {
  console.log('[SheetsLegacy] appendRow noop', row);
}
