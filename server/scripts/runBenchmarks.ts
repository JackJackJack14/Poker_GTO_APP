import {
  printBenchmarkReport,
  runGtoBenchmarks,
} from '../services/gtoBenchmark';

const ok = printBenchmarkReport(runGtoBenchmarks());
process.exit(ok ? 0 : 1);
