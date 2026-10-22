import subprocess
from collections import defaultdict
import datetime
import io
import os
import sys
import html
import matplotlib.pyplot as plt

from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    Image,
    KeepTogether,
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

COLLEGE_NAME = (
    "Swami Keshvanand Institute of Technology, Management & Gramothan, Jaipur"
)
DEPARTMENT_NAME = "Department of Computer Science & Engineering"


def get_repo_info(repo_dir=None):
    repo_name = "Project-Repository"
    branch_name = os.environ.get("REPORT_BRANCH_NAME")
    cmd_prefix = ["git", "-C", repo_dir] if repo_dir else ["git"]

    try:
        root_path = subprocess.check_output(
            cmd_prefix + ["rev-parse", "--show-toplevel"], encoding="utf-8"
        ).strip()
        repo_name = os.path.basename(root_path)
    except Exception:
        try:
            remote_url = subprocess.check_output(
                cmd_prefix + ["config", "--get", "remote.origin.url"], encoding="utf-8"
            ).strip()
            repo_name = remote_url.rstrip("/").split("/")[-1].replace(".git", "")
        except Exception:
            repo_name = os.path.basename(os.getcwd())

    if not branch_name:
        try:
            branch_name = subprocess.check_output(
                cmd_prefix + ["rev-parse", "--abbrev-ref", "HEAD"], encoding="utf-8"
            ).strip()
        except Exception:
            branch_name = "main"

    return repo_name, branch_name


THREE_STUDENTS = ["Jenkins", "utkarsh_kumar", "utkarsh_gupta"]


def map_author_to_student(author, msg=""):
    a = author.lower()
    m = msg.lower() if msg else ""
    if "[jenkins-feedback]" in m or "jenkins" in a or "jenkins" in m:
        return "Jenkins"
    elif "aman" in a or "kumar" in a:
        return "utkarsh_kumar"
    elif "gupta" in a or "utkarsh" in a:
        return "utkarsh_gupta"
    else:
        return "utkarsh_kumar"


def get_git_metrics(interval="weekly", target_date=None, repo_dir=None):
    if target_date is None:
        target_date = datetime.date.today()
    elif isinstance(target_date, str):
        target_date = datetime.datetime.strptime(target_date, "%Y-%m-%d").date()

    cmd_prefix = ["git", "-C", repo_dir] if repo_dir else ["git"]

    if interval == "weekly":
        start_date = target_date - datetime.timedelta(days=7)
        start_str = start_date.strftime("%Y-%m-%d")
        end_str = target_date.strftime("%Y-%m-%d")
        git_args = cmd_prefix + [
            "log",
            "--all",
            "--no-merges",
            f"--since-as-filter={start_str} 00:00:00",
            f"--until={end_str} 23:59:59",
            "--pretty=format:COMMIT|||%h|||%an|||%ad|||%s",
            "--date=short",
            "--numstat",
        ]
        scope_title = f"({start_str} to {end_str})"
    elif interval == "monthly":
        start_date = target_date.replace(day=1)
        start_str = start_date.strftime("%Y-%m-%d")
        end_str = target_date.strftime("%Y-%m-%d")
        git_args = cmd_prefix + [
            "log",
            "--all",
            "--no-merges",
            f"--since-as-filter={start_str} 00:00:00",
            f"--until={end_str} 23:59:59",
            "--pretty=format:COMMIT|||%h|||%an|||%ad|||%s",
            "--date=short",
            "--numstat",
        ]
        scope_title = f"({start_str} to {end_str})"
    else:
        git_args = cmd_prefix + [
            "log",
            "--all",
            "--no-merges",
            "--pretty=format:COMMIT|||%h|||%an|||%ad|||%s",
            "--date=short",
            "--numstat",
        ]
        scope_title = "Complete Project Lifecycle (All Commits)"

    try:
        raw_output = subprocess.check_output(
            git_args, encoding="utf-8", errors="replace"
        )
    except subprocess.CalledProcessError:
        print(
            "[ERROR] Git command failed. Please ensure you are inside a Git repository."
        )
        return None, None, None, scope_title

    students = {
        name: {"commits": 0, "added": 0, "deleted": 0, "active_days": set()}
        for name in THREE_STUDENTS
    }
    timeline_activity = defaultdict(lambda: defaultdict(int))
    student_logs = defaultdict(list)

    current_author = None
    current_date_str = None

    for line in raw_output.strip().split("\n"):
        line = line.strip()
        if not line:
            continue

        if line.startswith("COMMIT|||"):
            parts = line.split("|||")
            if len(parts) >= 5:
                sha = parts[1].strip()
                author = parts[2].strip()
                date_str = parts[3].strip()
                msg = "|||".join(parts[4:]).strip()
            else:
                continue

            if "archive form-3" in msg.lower() or "github-actions" in author.lower():
                current_author = None
                continue

            current_author = map_author_to_student(author, msg)
            current_date_str = date_str

            students[current_author]["commits"] += 1
            students[current_author]["active_days"].add(current_date_str)
            student_logs[current_author].append((date_str, sha, msg))

            try:
                dt = datetime.datetime.strptime(current_date_str, "%Y-%m-%d").date()
                if interval == "weekly":
                    period_key = dt.strftime("%a (%b %d)")
                elif interval == "monthly":
                    period_key = f"{dt.isocalendar()[0]}-W{dt.isocalendar()[1]:02d}"
                else:
                    period_key = dt.strftime("%Y-%m")
                timeline_activity[period_key][current_author] += 1
            except Exception:
                pass

        elif current_author and not line.startswith("COMMIT|||"):
            parts = line.split()
            if len(parts) >= 2 and parts[0].isdigit() and parts[1].isdigit():
                students[current_author]["added"] += int(parts[0])
                students[current_author]["deleted"] += int(parts[1])

    return students, timeline_activity, student_logs, scope_title


def create_charts(students, timeline_activity, interval):
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(11, 3.8))
    authors = [s for s in THREE_STUDENTS if s in students]
    periods = sorted(timeline_activity.keys())

    has_activity = periods and any(
        timeline_activity[p].get(a, 0) > 0 for p in periods for a in authors
    )
    if has_activity:
        for author in authors:
            counts = [timeline_activity[p].get(author, 0) for p in periods]
            ax1.plot(periods, counts, marker="o", linewidth=2, label=author)
        ax1.set_title(
            f"Commit Timeline ({interval.capitalize()})", fontsize=10, fontweight="bold"
        )
        ax1.set_ylabel("Commits")
        ax1.tick_params(axis="x", rotation=30)
        ax1.grid(True, linestyle="--", alpha=0.5)
        ax1.legend(fontsize=8)
    else:
        ax1.text(
            0.5, 0.5, "No commits found in this interval", ha="center", va="center"
        )

    total_loc = sum(students[a]["added"] + students[a]["deleted"] for a in authors)
    if authors and total_loc > 0:
        net_loc = [students[a]["added"] - students[a]["deleted"] for a in authors]
        colors_list = ["#4E79A7", "#F28E2B", "#E15759"]
        ax2.bar(authors, net_loc, color=colors_list[: len(authors)], width=0.45)
        ax2.set_title("Net Lines of Code Written", fontsize=10, fontweight="bold")
        ax2.set_ylabel("LOC (Added - Deleted)")
        ax2.grid(axis="y", linestyle="--", alpha=0.5)
    else:
        ax2.text(0.5, 0.5, "No LOC changes recorded", ha="center", va="center")

    plt.tight_layout()
    img_buffer = io.BytesIO()
    plt.savefig(img_buffer, format="png", dpi=200)
    plt.close()
    img_buffer.seek(0)
    return Image(img_buffer, width=500, height=170)


def generate_pdf(
    interval="weekly", target_date_str=None, output_dir=None, repo_dir=None
):
    if target_date_str:
        target_date = datetime.datetime.strptime(target_date_str, "%Y-%m-%d").date()
    else:
        target_date = datetime.date.today()

    repo_name, branch_name = get_repo_info(repo_dir)
    students, timeline_activity, student_logs, scope_title = get_git_metrics(
        interval, target_date, repo_dir
    )

    if students is None:
        return

    date_stamp = target_date.strftime("%Y-%m-%d")
    generated_on = target_date.strftime("%B %d, %Y")

    if interval == "weekly":
        report_title = "Weekly Progress Report"
        doc_name = f"{repo_name}_Weekly_Progress_Report_Form-3_{date_stamp}.pdf"
    elif interval == "monthly":
        report_title = "Monthly Progress Report (Form-3)"
        doc_name = f"{repo_name}_Monthly_Progress_Report_Form-3_{date_stamp}.pdf"
    else:
        report_title = "Final Project Evaluation Report"
        doc_name = f"{repo_name}_Final_Report_{date_stamp}.pdf"

    if output_dir:
        os.makedirs(output_dir, exist_ok=True)
        pdf_path = os.path.join(output_dir, doc_name)
    else:
        pdf_path = doc_name

    doc = SimpleDocTemplate(
        pdf_path,
        pagesize=letter,
        rightMargin=36,
        leftMargin=36,
        topMargin=30,
        bottomMargin=30,
    )
    styles = getSampleStyleSheet()

    college_style = ParagraphStyle(
        "CollegeStyle",
        parent=styles["Heading1"],
        fontSize=13.5,
        leading=17,
        textColor=colors.HexColor("#0F172A"),
        alignment=1,
        spaceAfter=2,
    )
    dept_style = ParagraphStyle(
        "DeptStyle",
        parent=styles["Normal"],
        fontSize=9.5,
        leading=13,
        textColor=colors.HexColor("#475569"),
        alignment=1,
        spaceAfter=6,
    )
    title_style = ParagraphStyle(
        "TitleStyle",
        parent=styles["Heading2"],
        fontSize=13,
        leading=17,
        textColor=colors.HexColor("#1A365D"),
        alignment=1,
        spaceAfter=5,
    )
    repo_style = ParagraphStyle(
        "RepoStyle",
        parent=styles["Normal"],
        fontSize=9.5,
        leading=14,
        textColor=colors.HexColor("#0F172A"),
        spaceAfter=3,
    )
    meta_style = ParagraphStyle(
        "MetaStyle",
        parent=styles["Normal"],
        fontSize=8.5,
        textColor=colors.HexColor("#64748B"),
        spaceAfter=8,
    )
    section_style = ParagraphStyle(
        "SectionStyle",
        parent=styles["Heading2"],
        fontSize=10.5,
        leading=14,
        textColor=colors.HexColor("#0F172A"),
        spaceBefore=7,
        spaceAfter=4,
    )
    sub_section_style = ParagraphStyle(
        "SubSectionStyle",
        parent=styles["Heading3"],
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#2563EB"),
        spaceBefore=5,
        spaceAfter=2,
    )
    msg_style = ParagraphStyle(
        "MsgStyle",
        parent=styles["Normal"],
        fontSize=8,
        leading=10,
        textColor=colors.HexColor("#1E293B"),
    )
    meta_cell_style = ParagraphStyle(
        "MetaCellStyle",
        parent=styles["Normal"],
        fontSize=8,
        leading=10,
        textColor=colors.HexColor("#475569"),
        alignment=1,
    )

    story = []
    story.append(Paragraph(f"<b>{html.escape(COLLEGE_NAME)}</b>", college_style))
    story.append(Paragraph(f"<b>{html.escape(DEPARTMENT_NAME)}</b>", dept_style))
    story.append(Paragraph(f"<u><b>{report_title}</b></u>", title_style))
    story.append(Spacer(1, 3))

    story.append(
        Paragraph(
            f"<b>Project Repository:</b> <font color='#2563EB'><b>{html.escape(repo_name)}</b></font> &nbsp;|&nbsp; <b>Branch:</b> <code>{html.escape(branch_name)}</code>",
            repo_style,
        )
    )
    story.append(
        Paragraph(
            f"<b>Evaluation Window:</b> {scope_title} &nbsp;|&nbsp; <b>Generated On:</b> {generated_on}",
            meta_style,
        )
    )

    story.append(Paragraph("1. Individual Contribution Breakdown", section_style))
    total_commits = sum(data["commits"] for data in students.values())
    table_data = [
        [
            "Student Name",
            "Commits (%)",
            "Lines Added",
            "Lines Deleted",
            "Net LOC",
            "Active Days",
        ]
    ]

    if students:
        for name, data in students.items():
            pct = (data["commits"] / total_commits * 100) if total_commits > 0 else 0
            net = data["added"] - data["deleted"]
            table_data.append(
                [
                    html.escape(name),
                    f"{data['commits']} ({pct:.1f}%)",
                    f"+{data['added']:,}",
                    f"-{data['deleted']:,}",
                    f"{net:,}",
                    f"{len(data['active_days'])} days",
                ]
            )
    else:
        table_data.append(
            [
                "No commits found in this period. Run with 'final' to see all commits.",
                "-",
                "-",
                "-",
                "-",
                "-",
            ]
        )

    table = Table(table_data, colWidths=[120, 80, 80, 80, 80, 100])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1E293B")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("ALIGN", (0, 1), (0, -1), "LEFT"),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
                ("TOPPADDING", (0, 0), (-1, -1), 3.5),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
                (
                    "ROWBACKGROUNDS",
                    (0, 1),
                    (-1, -1),
                    [colors.white, colors.HexColor("#F8FAFC")],
                ),
            ]
        )
    )
    story.append(table)
    story.append(Spacer(1, 6))

    story.append(Paragraph("2. Visual Trends & Volume", section_style))
    chart_image = create_charts(students, timeline_activity, interval)
    story.append(chart_image)
    story.append(Spacer(1, 6))

    story.append(
        Paragraph(f"3. Detailed Commit Logs ({interval.capitalize()})", section_style)
    )
    if not student_logs:
        story.append(
            Paragraph(
                "<i>No commit logs found for this timeframe.</i>", styles["Normal"]
            )
        )
    else:
        for student_name, logs in student_logs.items():
            student_section = []
            student_section.append(
                Paragraph(
                    f"<b>Student:</b> {html.escape(student_name)} — <i>{len(logs)} commit(s)</i>",
                    sub_section_style,
                )
            )
            log_table_data = [["Date", "Hash", "Commit Message"]]
            for date_val, sha_val, msg_val in logs:
                safe_msg = html.escape(msg_val) if msg_val else "(No commit message)"
                log_table_data.append(
                    [
                        Paragraph(date_val, meta_cell_style),
                        Paragraph(f"<code>{sha_val}</code>", meta_cell_style),
                        Paragraph(safe_msg, msg_style),
                    ]
                )

            log_table = Table(log_table_data, colWidths=[70, 60, 410])
            log_table.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#475569")),
                        ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
                        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                        ("FONTSIZE", (0, 0), (-1, -1), 7.5),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
                        ("TOPPADDING", (0, 0), (-1, -1), 2.5),
                        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
                        (
                            "ROWBACKGROUNDS",
                            (0, 1),
                            (-1, -1),
                            [colors.white, colors.HexColor("#F8FAFC")],
                        ),
                    ]
                )
            )
            student_section.append(log_table)
            student_section.append(Spacer(1, 5))
            story.append(KeepTogether(student_section))

    doc.build(story)
    print(f"\n[SUCCESS] Generated: {doc_name}")
    print(f" -> Found {len(students)} student(s) and {total_commits} total commits.")


if __name__ == "__main__":
    chosen_interval = sys.argv[1].lower() if len(sys.argv) > 1 else "weekly"
    target_date = sys.argv[2] if len(sys.argv) > 2 else None
    out_dir = sys.argv[3] if len(sys.argv) > 3 else None
    repo_path = sys.argv[4] if len(sys.argv) > 4 else None

    if not repo_path:
        for candidate in [".", "college-placement-portal"]:
            if os.path.exists(os.path.join(candidate, ".git")):
                repo_path = candidate
                break

    generate_pdf(
        chosen_interval,
        target_date_str=target_date,
        output_dir=out_dir,
        repo_dir=repo_path,
    )
