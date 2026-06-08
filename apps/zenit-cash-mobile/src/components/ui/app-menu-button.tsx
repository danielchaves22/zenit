import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '@/store/auth-store';

export function AppMenuButton() {
  const logout = useAuthStore((state) => state.logout);
  const [isOpen, setIsOpen] = useState(false);

  const closeMenu = () => setIsOpen(false);

  const handleNavigate = (path: '/company-select' | '/about') => {
    closeMenu();
    router.push(path as never);
  };

  const handleLogout = async () => {
    closeMenu();
    await logout();
    router.replace('/login');
  };

  return (
    <>
      <Pressable accessibilityLabel="Menu do aplicativo" onPress={() => setIsOpen(true)} style={styles.trigger}>
        <Text style={styles.triggerLabel}>⋮</Text>
      </Pressable>

      <Modal animationType="fade" onRequestClose={closeMenu} transparent visible={isOpen}>
        <Pressable onPress={closeMenu} style={styles.backdrop}>
          <Pressable style={styles.menuCard}>
            <Pressable onPress={() => handleNavigate('/company-select')} style={styles.menuItem}>
              <Text style={styles.menuItemLabel}>Trocar empresa</Text>
            </Pressable>

            <Pressable onPress={() => handleNavigate('/about')} style={styles.menuItem}>
              <Text style={styles.menuItemLabel}>Sobre</Text>
            </Pressable>

            <View style={styles.divider} />

            <Pressable onPress={handleLogout} style={styles.menuItem}>
              <Text style={[styles.menuItemLabel, styles.dangerLabel]}>Sair</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    alignItems: 'center',
    height: 36,
    justifyContent: 'center',
    marginRight: 4,
    width: 36
  },
  triggerLabel: {
    color: '#1b2430',
    fontSize: 24,
    lineHeight: 24
  },
  backdrop: {
    backgroundColor: 'rgba(12, 17, 23, 0.2)',
    flex: 1
  },
  menuCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    elevation: 12,
    marginLeft: 'auto',
    marginRight: 16,
    marginTop: 64,
    minWidth: 220,
    overflow: 'hidden',
    shadowColor: '#09111a',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.16,
    shadowRadius: 20
  },
  menuItem: {
    paddingHorizontal: 18,
    paddingVertical: 16
  },
  menuItemLabel: {
    color: '#1b2430',
    fontSize: 15,
    fontWeight: '600'
  },
  divider: {
    backgroundColor: '#e8edf2',
    height: 1
  },
  dangerLabel: {
    color: '#8b3340'
  }
});
