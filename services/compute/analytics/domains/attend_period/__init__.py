#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""时段出勤看板 —— 时段出勤率 / 明细 / 全站合并（看板私有）。

成员：attend_period（主计算）、attend_period_source（数据源与进程内数据集）、
attend_period_station（站点维度）、attend_period_all（全部站点合并）、
rider_period_detail（骑手×时段明细）。站点范围默认取全部可见站点，
无应排人数（predictNum=0）的站点不进入看板。

只依赖 `analytics/core/`；不得引用其它看板的域包。
"""
