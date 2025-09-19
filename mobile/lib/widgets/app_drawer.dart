// lib/widgets/app_drawer.dart

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

class AppDrawer extends StatelessWidget {
  const AppDrawer({Key? key}) : super(key: key);

  // Função exemplo: retorna a data da última sincronização (substitua conforme sua lógica)
  DateTime? getLastSync() {
    // Você pode recuperar esse dado de SharedPreferences ou do seu serviço de sincronização.
    return null; // null se nenhum sync foi realizado
  }

  Widget _buildSyncSection(BuildContext context) {
    DateTime? lastSync = getLastSync();
    if (true) {
      if (lastSync != null) {
        return ListTile(
          leading: const Icon(Icons.sync),
          title: const Text("Sincronização"),
          subtitle: Text(
              "Última sincronização: ${DateFormat('dd/MM/yyyy HH:mm').format(lastSync)}"),
          onTap: () {
            // Aqui pode ser implementada a lógica de forçar sincronização.
          },
        );
      } else {
        return ListTile(
          leading: const Icon(Icons.sync),
          title: const Text("Sincronização"),
          subtitle: const Text("Nenhuma sincronização realizada"),
          onTap: () {},
        );
      }
  }

  @override
  Widget build(BuildContext context) {
    return Drawer(
      child: Column(
        children: [
          const UserAccountsDrawerHeader(
            accountName: Text('Anônimo'),
            accountEmail: Text(''),
            currentAccountPicture: CircleAvatar(
              child: Icon(Icons.person, size: 40),
            ),
            decoration: BoxDecoration(
              color: Colors.green,
            ),
          ),
          Expanded(
            child: ListView(
              children: [
                ListTile(
                  leading: const Icon(Icons.list),
                  title: const Text('Orçamentos'),
                  onTap: () {
                    Navigator.pushNamedAndRemoveUntil(
                        context, '/lista', (route) => false);
                  },
                ),
                ListTile(
                  leading: const Icon(Icons.settings),
                  title: const Text('Configurações'),
                  onTap: () {
                    Navigator.pushNamed(context, '/configuracoes');
                  },
                ),
              ],
            ),
          ),
          const Divider(),
          _buildSyncSection(context),
        ],
      ),
    );
  }
}
