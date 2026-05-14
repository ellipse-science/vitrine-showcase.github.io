export type PeriodType = 'last_pdq' | 'session' | 'legislature';

export type PartyIntervention = {
  party: string;     // abbreviation: CAQ, PLQ, PQ, QS, PCQ
  fullName: string;
  interventions: number;
  score: number;     // 0–1, relative to the most active party
};

export type PeriodSnapshot = {
  periodLabel: string;
  startDate: string;
  endDate: string;
  title: string;     // editorial angle of the most-active party
  partyInterventions: PartyIntervention[];
};

export type ParoleAssembly = {
  assemblyId: 'QC';
  chambre: string;
  monitoredParties: string[];
  periods: { [K in PeriodType]?: PeriodSnapshot };
};

export type ParoleEnChambrePayload = {
  generatedAt: string;
  assemblies: { QC: ParoleAssembly };
};
