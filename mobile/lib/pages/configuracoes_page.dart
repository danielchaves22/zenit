import 'package:flutter/material.dart';
import '../widgets/app_drawer.dart';

class ConfiguracoesPage extends StatelessWidget {
  const ConfiguracoesPage({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      drawer: const AppDrawer(),
      appBar: AppBar(title: const Text('Configurações')),
      body: const Center(child: Text('Configurações')),
    );
  }
}
