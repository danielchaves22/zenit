import React from 'react';
import BankReconciliationSession, { BankReconciliationSessionProps } from './BankReconciliationSession';

/** Transitional presentation. Persisted operations belong to the shared session. */
export default function BankReconciliationWorkspace(props: BankReconciliationSessionProps) {
  return <BankReconciliationSession {...props} experience="classic" />;
}
