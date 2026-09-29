import {
  BookOpen,
  Compass,
  Database,
  Dumbbell,
  FileCheck2,
  LayoutDashboard,
  ListChecks,
  Settings,
  Users,
} from "lucide-react";

export const navigationByRole = {
  student: [
    ["dashboard", "工作台", LayoutDashboard],
    ["classes", "我的班级", Users],
    ["tasks", "测评任务", ListChecks],
    ["records", "测评记录", BookOpen],
    ["reports", "报告中心", FileCheck2],
    ["standards", "AI 能力标准", Compass],
    ["profile", "个人中心", Settings],
  ],
  teacher: [
    ["dashboard", "工作台", LayoutDashboard],
    ["questions", "对话题库", Database],
    ["training", "训练题库", Dumbbell],
    ["classes", "我的班级", Users],
    ["tasks", "测评任务", BookOpen],
    ["profile", "个人中心", Settings],
  ],
};

export const getNavigation = (role) =>
  navigationByRole[role] || navigationByRole.student;
