import 'package:flutter/material.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:orcamento_app/pages/lista_orcamentos_inativos_page.dart';
import 'package:orcamento_app/pages/registrar_movimentacao_page.dart';
import 'package:orcamento_app/pages/resumo_orcamento_page.dart';
import 'models/orcamento.dart';
import 'models/movimentacao.dart';
import 'pages/entry_point.dart';
import 'pages/criar_orcamento_page.dart';
import 'pages/lista_orcamentos_page.dart';
import 'pages/configuracoes_page.dart';
import 'pages/login_page.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'utils.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Hive.initFlutter();
  Hive.registerAdapter(OrcamentoAdapter());
  Hive.registerAdapter(MovimentacaoAdapter());
  Hive.registerAdapter(TipoMovimentacaoAdapter());
  Hive.registerAdapter(TipoOrcamentoAdapter());
  Hive.registerAdapter(StatusOrcamentoAdapter());

  await Hive.openBox<Orcamento>('orcamentos');

  await dotenv.load(fileName: '.env');
  dataDeTrabalhoAtual = dataDeTrabalho();

  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Orçamento Diário',
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
      },
      onGenerateRoute: (settings) {
        if (settings.name == '/resumo') {
          final orcamento = settings.arguments as Orcamento;
          return MaterialPageRoute(
              builder: (_) => ResumoOrcamentoPage(orcamento: orcamento));
        } else if (settings.name == '/movimentacao') {
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
          } else {
            final orcamento = settings.arguments as Orcamento;
            return MaterialPageRoute(
              builder: (_) => RegistrarMovimentacaoPage(orcamento: orcamento),
            );
          }
        } else if (settings.name == '/criarClone') {
          final orcamento = settings.arguments as Orcamento;
          return MaterialPageRoute(
              builder: (_) => CriarOrcamentoPage(orcamentoToClone: orcamento));
        }
        return null;
      },
    );
  }
}
