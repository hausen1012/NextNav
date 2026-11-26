package store

import (
	"encoding/json"
	"fmt"
	"net/url"
	"strings"
	"time"
)

// sampleJSON mirrors docs/FEATURES.md §8.2 so a fresh install has visible content.
const sampleJSON = `{
  "groups": [
    { "name": "搜索", "categories": [
      { "name": "搜索引擎", "links": [
        ["Google", "https://www.google.com", "全球搜索"],
        ["Bing", "https://www.bing.com", "微软搜索"],
        ["百度", "https://www.baidu.com", "中文搜索"],
        ["DuckDuckGo", "https://duckduckgo.com", "无追踪搜索"],
        ["搜狗", "https://www.sogou.com", "中文搜索与输入法"]
      ]}
    ]},
    { "name": "开发", "categories": [
      { "name": "代码托管", "links": [
        ["GitHub", "https://github.com", "微软旗下代码托管平台"],
        ["GitLab", "https://gitlab.com", "DevOps 平台"],
        ["Gitee", "https://gitee.com", "国内代码托管"],
        ["Bitbucket", "https://bitbucket.org", "Atlassian 代码托管"]
      ]},
      { "name": "云服务", "links": [
        ["AWS", "https://aws.amazon.com", "亚马逊云"],
        ["Microsoft Azure", "https://azure.microsoft.com", "微软云"],
        ["Google Cloud", "https://cloud.google.com", "谷歌云"],
        ["阿里云", "https://www.aliyun.com", "阿里云"],
        ["腾讯云", "https://cloud.tencent.com", "腾讯云"],
        ["Cloudflare", "https://www.cloudflare.com", "CDN 与 DNS"],
        ["Vercel", "https://vercel.com", "前端托管"],
        ["Netlify", "https://www.netlify.com", "前端托管"]
      ]},
      { "name": "开发者资源", "links": [
        ["MDN", "https://developer.mozilla.org", "Web 技术文档"],
        ["Stack Overflow", "https://stackoverflow.com", "开发者问答"],
        ["Docker Hub", "https://hub.docker.com", "容器镜像仓库"]
      ]}
    ]},
    { "name": "设计", "categories": [
      { "name": "设计工具", "links": [
        ["Figma", "https://www.figma.com", "协作式界面设计"],
        ["Adobe Creative Cloud", "https://www.adobe.com/creativecloud", "Adobe 全家桶"],
        ["Canva", "https://www.canva.com", "在线平面设计"],
        ["Sketch", "https://www.sketch.com", "macOS 界面设计"],
        ["即时设计", "https://js.design", "国产在线设计工具"]
      ]},
      { "name": "图片素材", "links": [
        ["Unsplash", "https://unsplash.com", "免费高质量图片"],
        ["Pexels", "https://www.pexels.com", "免费图片与视频"],
        ["Pixabay", "https://pixabay.com", "免费图片与插画"]
      ]},
      { "name": "字体图标", "links": [
        ["Google Fonts", "https://fonts.google.com", "免费字体库"],
        ["Font Awesome", "https://fontawesome.com", "图标库"],
        ["Iconfont", "https://www.iconfont.cn", "阿里巴巴图标库"]
      ]}
    ]},
    { "name": "效率", "categories": [
      { "name": "办公协作", "links": [
        ["Google Workspace", "https://workspace.google.com", "谷歌办公套件"],
        ["Microsoft 365", "https://www.microsoft.com/microsoft-365", "微软办公套件"],
        ["Slack", "https://slack.com", "团队沟通"],
        ["飞书", "https://www.feishu.cn", "字节跳动办公协作"],
        ["钉钉", "https://www.dingtalk.com", "阿里办公协作"],
        ["Zoom", "https://zoom.us", "视频会议"]
      ]},
      { "name": "笔记与文档", "links": [
        ["Notion", "https://www.notion.so", "笔记与知识库"],
        ["Obsidian", "https://obsidian.md", "本地 Markdown 笔记"],
        ["语雀", "https://www.yuque.com", "阿里知识库"],
        ["Dropbox", "https://www.dropbox.com", "云盘"],
        ["Google Drive", "https://drive.google.com", "谷歌云盘"]
      ]}
    ]},
    { "name": "资讯", "categories": [
      { "name": "科技媒体", "links": [
        ["The Verge", "https://www.theverge.com", "科技媒体"],
        ["TechCrunch", "https://techcrunch.com", "创业与科技新闻"],
        ["Hacker News", "https://news.ycombinator.com", "技术社区新闻"],
        ["少数派", "https://sspai.com", "数字生活媒体"],
        ["掘金", "https://juejin.cn", "开发者社区"]
      ]},
      { "name": "社区问答", "links": [
        ["Reddit", "https://www.reddit.com", "综合社区"],
        ["知乎", "https://www.zhihu.com", "中文问答"]
      ]}
    ]}
  ]
}`

type sampleDoc struct {
	Groups []struct {
		Name       string `json:"name"`
		Categories []struct {
			Name  string     `json:"name"`
			Links [][]string `json:"links"`
		} `json:"categories"`
	} `json:"groups"`
}

// SeedSample writes the demo content in a single transaction.
func (s *Store) SeedSample() error {
	var doc sampleDoc
	if err := json.Unmarshal([]byte(sampleJSON), &doc); err != nil {
		return fmt.Errorf("parse sample: %w", err)
	}

	tx, err := s.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	now := time.Now().UnixMilli()

	for gi, g := range doc.Groups {
		res, err := tx.Exec(
			`INSERT INTO category(name, parent_id, sort, is_private, created_at, updated_at)
			 VALUES(?, NULL, ?, 0, ?, ?)`,
			g.Name, int64(gi+1)*10, now, now,
		)
		if err != nil {
			return err
		}
		groupID, _ := res.LastInsertId()

		for ci, c := range g.Categories {
			cres, err := tx.Exec(
				`INSERT INTO category(name, parent_id, sort, is_private, created_at, updated_at)
				 VALUES(?, ?, ?, 0, ?, ?)`,
				c.Name, groupID, int64(ci+1)*10, now, now,
			)
			if err != nil {
				return err
			}
			catID, _ := cres.LastInsertId()

			for li, l := range c.Links {
				if len(l) < 3 {
					continue
				}
				title, linkURL, desc := l[0], l[1], l[2]
				host := sampleHost(linkURL)
				search := sampleJoinLower(title, host, desc, c.Name)
				if _, err := tx.Exec(
					`INSERT INTO link(category_id, title, url, description, sort,
					                  is_private, last_status,
					                  title_norm, host, search_text, created_at, updated_at)
					 VALUES(?,?,?,?,?,0,'unknown',?,?,?,?,?)`,
					catID, title, linkURL, desc, int64(li+1)*10,
					sampleNormalize(title), host, search, now, now,
				); err != nil {
					return err
				}
			}
		}
	}
	return tx.Commit()
}

func sampleNormalize(s string) string {
	return strings.ToLower(strings.Join(strings.Fields(s), " "))
}

func sampleHost(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	return strings.TrimPrefix(strings.ToLower(u.Hostname()), "www.")
}

func sampleJoinLower(parts ...string) string {
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.ToLower(strings.TrimSpace(p))
		if p != "" {
			out = append(out, p)
		}
	}
	return strings.Join(out, " ")
}
