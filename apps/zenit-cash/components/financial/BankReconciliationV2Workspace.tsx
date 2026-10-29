import React from 'react';
import BankReconciliationSession, { BankReconciliationSessionProps } from './BankReconciliationSession';

export default function BankReconciliationV2Workspace(props: BankReconciliationSessionProps) {
  return <BankReconciliationSession {...props} experience="guided" />;
}
