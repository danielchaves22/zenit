import type { DraftTransactionSummary } from '@zenit/assistant-contracts';

export function draftNeedsInput(summary: DraftTransactionSummary): boolean {
  return Boolean(summary.missingFields?.length || summary.fromAccountOptions?.length ||
    summary.toAccountOptions?.length || summary.categoryOptions?.length);
}

export function draftClarification(summary: DraftTransactionSummary): string {
  for (const field of ['fromAccount', 'toAccount'] as const) {
    const options = summary[field === 'fromAccount' ? 'fromAccountOptions' : 'toAccountOptions'];
    if (options?.length || summary.missingFields?.includes(field)) {
      const question = field === 'fromAccount' ? 'De qual conta saiu esse valor?' : 'Em qual conta entrou esse valor?';
      return options?.length
        ? `${question} ${options.map(option => option.name).join('; ')}. O lançamento ainda não foi gravado.`
        : 'Não encontrei uma conta disponível para esse lançamento. Confira as contas e suas permissões no Cash e peça uma nova revisão.';
    }
  }
  if (summary.categoryOptions?.length) return `Qual categoria deseja usar? ${summary.categoryOptions.map(option =>
    option.parentName ? `${option.parentName} / ${option.name}` : option.name).join('; ')}. O lançamento ainda não foi gravado.`;
  return 'Qual categoria deseja usar nesse lançamento? Não encontrei uma correspondência clara. As demais informações estão preservadas no rascunho.';
}
