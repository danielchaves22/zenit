import 'package:flutter/material.dart';
import 'package:orcamento_app/pages/lista_orcamentos_inativos_page.dart';
import 'package:orcamento_app/pages/registrar_movimentacao_page.dart';
import 'package:orcamento_app/pages/resumo_orcamento_page.dart';

import 'models/movimentacao.dart';
import 'models/orcamento.dart';
import 'pages/configuracoes_page.dart';
import 'pages/company_selection_page.dart';
import 'pages/criar_orcamento_page.dart';
import 'pages/entry_point.dart';
import 'pages/lista_orcamentos_page.dart';
import 'pages/login_page.dart';
import 'pages/register_page.dart';
import 'pages/sync_reconciliation_page.dart';
import 'services/app_services.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await AppServices.initialize();
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Orcamento Diario',
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.green),
      ),
      initialRoute: '/',
      routes: {
        '/': (context) => const EntryPoint(),
        '/lista': (context) => const ListaOrcamentosPage(),
        '/criar': (context) => const CriarOrcamentoPage(),
        '/inativos': (context) => const ListaOrcamentosInativosPage(),
        '/configuracoes': (context) => const ConfiguracoesPage(),
        '/login': (context) => const LoginPage(),
        '/register': (context) => const RegisterPage(),
        '/company-selection': (context) => const CompanySelectionPage(),
        '/sync-reconciliation': (context) => const SyncReconciliationPage(),
      },
      onGenerateRoute: (settings) {
        if (settings.name == '/resumo') {
          final orcamento = settings.arguments as Orcamento;
          return MaterialPageRoute(
            builder: (_) => ResumoOrcamentoPage(orcamento: orcamento),
          );
        }

        if (settings.name == '/movimentacao') {
          if (settings.arguments is Map) {
            final args = settings.arguments as Map<String, dynamic>;
            final orcamento = args['orcamento'] as Orcamento;
            final tipoFixo = args['tipoFixo'] as TipoMovimentacao?;
            return MaterialPageRoute(
              builder: (_) => RegistrarMovimentacaoPage(
                orcamento: orcamento,
                tipoFixo: tipoFixo,
              ),
            );
          }

          final orcamento = settings.arguments as Orcamento;
          return MaterialPageRoute(
            builder: (_) => RegistrarMovimentacaoPage(orcamento: orcamento),
          );
        }

        if (settings.name == '/criarClone') {
          final orcamento = settings.arguments as Orcamento;
          return MaterialPageRoute(
            builder: (_) => CriarOrcamentoPage(orcamentoToClone: orcamento),
          );
        }

        return null;
      },
    );
  }
}
