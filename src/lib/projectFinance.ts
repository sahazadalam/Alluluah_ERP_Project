import { Project, ProjectAssignment, ProjectExpense } from './types';

export interface ProjectFinancialSummary {
  directExpenses: number;
  employeeCosts: number;
  totalCosts: number;
  estimatedProfit: number;
}

export function assignmentDays(assignment: ProjectAssignment, project: Project): number {
  const start = new Date(`${assignment.start_date}T00:00:00`);
  const endDate = assignment.end_date ?? project.end_date ?? assignment.start_date;
  const end = new Date(`${endDate}T00:00:00`);
  const days = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  return Math.max(1, days);
}

export function employeeCost(assignment: ProjectAssignment, project: Project): number {
  return Number(assignment.daily_rate ?? 0) * assignmentDays(assignment, project);
}

export function calculateProjectFinancials(
  project: Project,
  assignments: ProjectAssignment[] = [],
  expenses: ProjectExpense[] = [],
): ProjectFinancialSummary {
  const directExpenses = expenses.reduce((total, expense) => total + Number(expense.amount ?? 0), 0);
  const employeeCosts = assignments
    .filter(assignment => assignment.is_active)
    .reduce((total, assignment) => total + employeeCost(assignment, project), 0);
  const totalCosts = directExpenses + employeeCosts;

  return {
    directExpenses,
    employeeCosts,
    totalCosts,
    estimatedProfit: Number(project.contract_value ?? 0) - totalCosts,
  };
}
