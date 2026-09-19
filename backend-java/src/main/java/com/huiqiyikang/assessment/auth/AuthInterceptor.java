package com.huiqiyikang.assessment.auth;

import cn.dev33.satoken.stp.StpUtil;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

@Component
public class AuthInterceptor implements HandlerInterceptor {
    @Override public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        String uri = request.getRequestURI();
        // /api/auth/** 是登录注册本身；/api/client-logs 是前端错误上报——
        // 登录页出错时还没有令牌，所以这两个都必须放行。
        // 前缀匹配只用在 /api/auth/ 上；错误上报按全等匹配，避免以后新增
        // /api/client-logs-xxx 这类路由时被一起放行。
        // /api/agent/** 是百宝箱 Agent 的服务端接口，用 X-Agent-Token 服务令牌鉴权（另设拦截器），
        // 不走 Sa-Token 登录态，所以在这里放行。
        if (uri.startsWith("/api/auth/") || uri.startsWith("/api/agent/") || uri.equals("/api/client-logs") || uri.equals("/api/client-logs/")
                || "OPTIONS".equalsIgnoreCase(request.getMethod())) return true;
        StpUtil.checkLogin();
        return true;
    }
}
