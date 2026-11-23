// Writes dart-reference.json: values from the Solei app's own Dart maths
// (Solei/lib/core/sun_math.dart + session_math.dart) for a constant UV index,
// which sun.test.mjs pins the web port to.
//
// The app files import Flutter only for @immutable, so run them with plain
// Dart from a scratch copy:
//   mkdir /tmp/solei-ref && cd /tmp/solei-ref
//   sed "s#import 'package:flutter/foundation.dart';#import 'stub.dart';#" ~/code/Projects/Solei/lib/core/sun_math.dart > sun_math.dart
//   sed -e "s#import 'package:flutter/foundation.dart';#import 'stub.dart';#" \
//       -e "s#import 'package:solei/core/sun_math.dart';#import 'sun_math.dart';#" \
//       ~/code/Projects/Solei/lib/core/session_math.dart > session_math.dart
//   printf "class Immutable { const Immutable(); }\nconst immutable = Immutable();\n" > stub.dart
//   cp <this file> . && dart dart_reference.dart > dart-reference.json
import 'dart:convert';

import 'session_math.dart';
import 'sun_math.dart';

final DateTime t0 = DateTime.utc(2026, 6, 21, 10);

UvCurve flat(double uvi) => UvCurve([
  UvSample(time: DateTime.utc(2026, 6, 20), clearSkyUvi: uvi, cloudFraction: 0),
  UvSample(time: DateTime.utc(2026, 6, 23), clearSkyUvi: uvi, cloudFraction: 0),
]);

double? minutes(Duration? d) =>
    d == null ? null : d.inMicroseconds / Duration.microsecondsPerMinute;

/// The session timer's limit when sunscreen is reapplied exactly when due,
/// all day long (applications every interval from the start).
double? limitReapplyingOnTime(
  UvCurve curve,
  SkinType skin,
  SpfLevel spf,
  bool swimming,
) {
  final config = SessionConfig(skinType: skin, spf: spf, swimming: swimming);
  final apps = <DateTime>[];
  for (var t = t0;
      t.isBefore(t0.add(const Duration(hours: 25)));
      t = t.add(config.reapplyEvery)) {
    apps.add(t);
  }
  final log = SessionLog(startedAt: t0, spans: [SunSpan(t0)], applications: apps);
  final limit = SessionMath.limitAt(
    curve: curve,
    config: config,
    log: log,
    now: t0,
  );
  return minutes(limit?.difference(t0));
}

void main() {
  const uvis = [
    0.05, 0.1, 0.3, 0.5, 1.0, 2.0, 2.5, 3.0, 4.0, 5.0, 6.0, 7.0, 7.3, 8.0,
    9.0, 10.0, 11.0, 12.0, 13.0, 14.0, 15.0,
  ];
  final safe = <Map<String, Object?>>[];
  for (final uvi in uvis) {
    final curve = flat(uvi);
    for (final skin in SkinType.values) {
      for (final spf in SpfLevel.values) {
        for (final swimming in [false, true]) {
          if (spf == SpfLevel.none && swimming) continue;
          final s = SessionMath.safeTime(
            curve: curve,
            skinType: skin,
            spf: spf,
            from: t0,
            swimming: swimming,
          );
          safe.add({
            'uvi': uvi,
            'skin': skin.number,
            'spf': spf.spf,
            'swimming': swimming,
            'minutes': minutes(s.duration),
            'capped': s.cappedByReapply,
            'whole_minutes': s.duration?.inMinutes,
            'on_time_minutes': spf == SpfLevel.none
                ? null
                : limitReapplyingOnTime(curve, skin, spf, swimming),
            'flip_minutes': SessionMath.autoFlipMinutes(s.duration),
          });
        }
      }
    }
  }

  final quiz = <String, int>{};
  for (var a = 0; a <= 5; a++) {
    for (var b = 0; b <= 5; b++) {
      for (var c = 0; c <= 5; c++) {
        quiz['$a$b$c'] = SkinQuiz.typeFor(
          skinColor: a,
          burnReaction: b,
          tanResponse: c,
        ).number;
      }
    }
  }

  final categories = <String, String>{
    for (final u in [0.0, 2.4, 2.5, 5.4, 5.5, 7.4, 7.5, 10.4, 10.5, 16.0])
      '$u': UvCategory.of(u).name,
  };

  print(const JsonEncoder.withIndent(' ').convert({
    'med': {for (final s in SkinType.values) '${s.number}': s.medJoules},
    'spf': {for (final l in SpfLevel.values) l.name: l.spf},
    'dark_uvi': SessionMath.darkUvi,
    'safe': safe,
    'quiz': quiz,
    'categories': categories,
  }));
}
