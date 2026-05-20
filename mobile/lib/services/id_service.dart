import 'package:uuid/uuid.dart';

class IdService {
  IdService._();

  static final IdService instance = IdService._();
  static const Uuid _uuid = Uuid();

  String next() {
    return _uuid.v4();
  }
}
