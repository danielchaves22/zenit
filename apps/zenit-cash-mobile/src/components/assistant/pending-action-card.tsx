import { PendingAction } from '@zenit/assistant-contracts';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type PendingActionCardProps = {
  pendingAction: PendingAction;
  onConfirm: (pendingActionId: number) => Promise<void>;
  onCancel: (pendingActionId: number) => Promise<void>;
};

export function PendingActionCard({
  pendingAction,
  onConfirm,
  onCancel
}: PendingActionCardProps) {
  const { summary } = pendingAction;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Rascunho do Operador</Text>
      <Text style={styles.row}>{summary.description}</Text>
      <Text style={styles.row}>
        R$ {summary.amount.toFixed(2)} · {summary.type} · {summary.date}
      </Text>
      {summary.category ? <Text style={styles.row}>Categoria: {summary.category.name}</Text> : null}
      {summary.fromAccount ? (
        <Text style={styles.row}>Origem: {summary.fromAccount.name}</Text>
      ) : null}
      {summary.toAccount ? <Text style={styles.row}>Destino: {summary.toAccount.name}</Text> : null}
      <View style={styles.actions}>
        <Pressable onPress={() => onConfirm(pendingAction.id)} style={styles.confirmButton}>
          <Text style={styles.confirmLabel}>Confirmar</Text>
        </Pressable>
        <Pressable onPress={() => onCancel(pendingAction.id)} style={styles.cancelButton}>
          <Text style={styles.cancelLabel}>Cancelar</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fdf6e9',
    borderColor: '#efcf9d',
    borderRadius: 22,
    borderWidth: 1,
    gap: 8,
    marginTop: 12,
    padding: 16
  },
  title: {
    color: '#171717',
    fontSize: 16,
    fontWeight: '700'
  },
  row: {
    color: '#4e4a43',
    fontSize: 14,
    lineHeight: 20
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8
  },
  confirmButton: {
    backgroundColor: '#163227',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  confirmLabel: {
    color: '#effbf5',
    fontWeight: '700'
  },
  cancelButton: {
    backgroundColor: '#ffffff',
    borderColor: '#d6d0c7',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  cancelLabel: {
    color: '#26282b',
    fontWeight: '700'
  }
});
