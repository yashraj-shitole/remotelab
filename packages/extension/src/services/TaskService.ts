import * as vscode from "vscode";
import { TaskSummary } from "@companion/shared";

export class TaskService {
  async list(): Promise<TaskSummary[]> {
    const tasks = await vscode.tasks.fetchTasks();
    return tasks.map((task) => ({
      id: taskId(task),
      name: task.name,
      source: String(task.source),
      type: typeof task.definition.type === "string" ? task.definition.type : undefined
    }));
  }

  async run(id: string): Promise<TaskSummary | undefined> {
    const tasks = await vscode.tasks.fetchTasks();
    const task = tasks.find((candidate) => taskId(candidate) === id || candidate.name === id);
    if (!task) {
      return undefined;
    }

    await vscode.tasks.executeTask(task);
    return {
      id: taskId(task),
      name: task.name,
      source: String(task.source),
      type: typeof task.definition.type === "string" ? task.definition.type : undefined
    };
  }
}

function taskId(task: vscode.Task): string {
  return `${task.source}:${task.name}`;
}
