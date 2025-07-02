import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:flutter_dotenv/flutter_dotenv.dart';

class ApiService {
  final String baseUrl = dotenv.env['API_URL'] ?? 'http://localhost:3000';
  String? token;

  Future<void> login(String email, String password) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/auth/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'email': email, 'password': password}),
    );
    if (response.statusCode == 201 || response.statusCode == 200) {
      final data = jsonDecode(response.body);
      token = data['token'];
    } else {
      throw Exception('Falha no login');
    }
  }

  Map<String, String> authHeaders() {
    return {
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token'
    };
  }

  Future<void> post(String path, Map<String, dynamic> data) async {
    await http.post(
      Uri.parse(baseUrl + path),
      headers: authHeaders(),
      body: jsonEncode(data),
    );
  }

  Future<List<dynamic>> getList(String path) async {
    final response = await http.get(
      Uri.parse(baseUrl + path),
      headers: authHeaders(),
    );
    if (response.statusCode == 200) {
      return jsonDecode(response.body) as List<dynamic>;
    }
    throw Exception('Erro na requisição');
  }
}
