// Reference values from the app's own forecast code, for the web port's tests.
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:jetcalm/forecast/airport.dart';
import 'package:jetcalm/forecast/flight_plan.dart';
import 'package:jetcalm/forecast/geo.dart';
import 'package:jetcalm/forecast/grid.dart';
import 'package:jetcalm/forecast/levels.dart';
import 'package:jetcalm/forecast/sampler.dart';
import 'package:jetcalm/forecast/timeline.dart';
import 'package:timezone/data/latest_all.dart' as tzdata;

const app = '/Users/jackson/code/Projects/Jetcalm';
const tiles = '$app/assets/fixtures/tiles';
const extra = '$app/test/fixtures/tiles_extra';

void main() {
  tzdata.initializeTimeZones();
  final airportsJson =
      jsonDecode(File('$app/assets/airports.json').readAsStringSync())
          as Map<String, dynamic>;
  final airports = {
    for (final row in airportsJson['airports'] as List<dynamic>)
      (row as List<dynamic>)[0] as String: Airport.fromRow(row),
  };
  final manifest = Manifest.fromJson(
    jsonDecode(File('$tiles/manifest.json').readAsStringSync()),
  );

  StepGrid? load(StepInfo info) {
    for (final dir in [tiles, extra]) {
      final f = File('$dir/${info.file}');
      if (f.existsSync()) {
        return StepGrid.fromBytes(
          info,
          manifest.grid,
          Uint8List.fromList(gzip.decode(f.readAsBytesSync())),
        );
      }
    }
    return null;
  }

  final out = <String, dynamic>{};
  out['distances'] = {
    for (final pair in [
      ['JFK', 'LHR'],
      ['LAX', 'HNL'],
      ['SYD', 'LAX'],
      ['JFK', 'HKG'],
      ['LHR', 'CDG'],
    ])
      '${pair[0]}-${pair[1]}': {
        'km': Geo.distanceKm(airports[pair[0]]!.point, airports[pair[1]]!.point),
        'points': Geo.greatCircle(
          airports[pair[0]]!.point,
          airports[pair[1]]!.point,
        ).length,
        'estimate_min': FlightTimes.estimateDuration(
          Geo.distanceKm(airports[pair[0]]!.point, airports[pair[1]]!.point),
        ).inMinutes,
        'mid': () {
          final p = Geo.greatCircle(
            airports[pair[0]]!.point,
            airports[pair[1]]!.point,
          );
          final m = p[p.length ~/ 2];
          return [m.latitude, m.longitude];
        }(),
        'max_lat': Geo.greatCircle(
          airports[pair[0]]!.point,
          airports[pair[1]]!.point,
        ).map((p) => p.latitude).reduce((a, b) => a > b ? a : b),
      },
  };
  out['cells'] = [
    for (final p in [
      [75.0, -180.0],
      [75.25, 0.0],
      [75.26, 0.0],
      [-75.25, 179.75],
      [-75.3, 10.0],
      [40.6394, -73.7793],
      [51.4707, -0.4599],
      [0.25, 179.76],
      [33.333, 200.0],
      [-12.75, -0.25],
    ])
      {
        'lat': p[0],
        'lon': p[1],
        'row': manifest.grid.rowOf(p[0]),
        'col': manifest.grid.colOf(p[1]),
      },
  ];
  const th = Thresholds();
  out['levels'] = {
    for (final v in [0, 14, 15, 21, 22, 33, 34, 44, 45, 100])
      '$v': th.levelOf(v).name,
  };
  out['toUtc'] = [
    for (final c in [
      ['America/New_York', 2026, 11, 24, 18, 0],
      ['Europe/London', 2026, 7, 1, 9, 30],
      ['Australia/Sydney', 2026, 11, 25, 10, 15],
      ['Pacific/Honolulu', 2026, 3, 8, 2, 30],
      ['America/New_York', 2026, 3, 8, 2, 30],
    ])
      {
        'in': c,
        'utc': FlightTimes.toUtc(
          c[0] as String,
          c[1] as int,
          c[2] as int,
          c[3] as int,
          ClockTime(c[4] as int, c[5] as int),
        ).toIso8601String(),
      },
  ];

  final flights = <Map<String, dynamic>>[];
  for (final f in [
    ['JFK', 'LHR', '2026-11-23T23:00:00Z'],
    ['JFK', 'LHR', '2026-11-24T01:10:00Z'],
    ['LHR', 'JFK', '2026-11-24T02:00:00Z'],
    ['LAX', 'HNL', '2026-11-26T22:30:00Z'],
    ['JFK', 'HKG', '2026-11-23T22:00:00Z'],
  ]) {
    final origin = airports[f[0]]!;
    final destination = airports[f[1]]!;
    final dep = DateTime.parse(f[2]);
    final plan = FlightPlan(
      origin: origin,
      destination: destination,
      departure: dep,
      arrival: dep.add(
        FlightTimes.estimateDuration(
          Geo.distanceKm(origin.point, destination.point),
        ),
      ),
    );
    final infos = manifest.stepsFor(plan.departure, plan.arrival);
    final steps = [
      for (final info in infos)
        if (load(info) case final StepGrid s) s,
    ];
    final samples = Sampler.sample(plan, steps);
    final summary = ForecastSummary.of(samples, th, plan.durationMinutes);
    final expected = Timeline.expected(samples, th, plan.durationMinutes);
    final could = Timeline.couldReach(samples, th, plan.durationMinutes);
    Map<String, dynamic>? seg(Segment? s) => s == null
        ? null
        : {
            'level': s.level?.name,
            'start': s.start,
            'end': s.end,
            'peak': s.peak,
          };
    flights.add({
      'from': f[0],
      'to': f[1],
      'dep': f[2],
      'arr': plan.arrival.toIso8601String(),
      'duration': plan.durationMinutes,
      'climb': plan.climbMinutes,
      'descent': plan.descentMinutes,
      'steps_for': [for (final i in infos) i.file],
      'steps_loaded': [for (final s in steps) s.info.file],
      'samples': [for (final s in samples) s.toJson()],
      'expected': [for (final s in expected) seg(s)],
      'could': [for (final s in could) seg(s)],
      'summary': {
        'headline': summary.headline?.name,
        'shares': {
          for (final e in summary.shares.entries) e.key.name: e.value,
        },
        'gap': summary.noDataShare,
        'worst': seg(summary.worst),
        'stronger': seg(summary.stronger),
        'storm': summary.stormAtMinutes,
      },
    });
  }
  out['flights'] = flights;
  stdout.write(const JsonEncoder.withIndent(' ').convert(out));
}
