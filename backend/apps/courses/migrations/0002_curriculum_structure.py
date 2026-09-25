import uuid

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("courses", "0001_initial")]

    operations = [
        migrations.AddField(
            model_name="course",
            name="goal",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="course",
            name="source_id",
            field=models.CharField(blank=True, max_length=120, null=True, unique=True),
        ),
        migrations.AddField(
            model_name="course",
            name="tool",
            field=models.CharField(blank=True, default="", max_length=300),
        ),
        migrations.AddField(
            model_name="course",
            name="volume",
            field=models.CharField(blank=True, default="", max_length=200),
        ),
        migrations.CreateModel(
            name="Module",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("source_id", models.CharField(max_length=120)),
                ("position", models.PositiveIntegerField()),
                ("title", models.CharField(max_length=200)),
                (
                    "course",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="modules",
                        to="courses.course",
                    ),
                ),
            ],
            options={
                "ordering": ("position", "created_at"),
            },
        ),
        migrations.AddField(
            model_name="draftstep",
            name="module",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="draft_steps",
                to="courses.module",
            ),
        ),
        migrations.AddField(
            model_name="draftstep",
            name="source_id",
            field=models.CharField(blank=True, max_length=120, null=True),
        ),
        migrations.AddField(
            model_name="courserevision",
            name="goal",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="courserevision",
            name="source_id",
            field=models.CharField(blank=True, max_length=120, null=True),
        ),
        migrations.AddField(
            model_name="courserevision",
            name="tool",
            field=models.CharField(blank=True, default="", max_length=300),
        ),
        migrations.AddField(
            model_name="courserevision",
            name="volume",
            field=models.CharField(blank=True, default="", max_length=200),
        ),
        migrations.CreateModel(
            name="ModuleRevision",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("source_id", models.CharField(max_length=120)),
                ("position", models.PositiveIntegerField()),
                ("title", models.CharField(max_length=200)),
                (
                    "module",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="revisions",
                        to="courses.module",
                    ),
                ),
                (
                    "revision",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="modules",
                        to="courses.courserevision",
                    ),
                ),
            ],
            options={
                "ordering": ("position",),
            },
        ),
        migrations.AddField(
            model_name="steprevision",
            name="module_revision",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="steps",
                to="courses.modulerevision",
            ),
        ),
        migrations.AddField(
            model_name="steprevision",
            name="source_id",
            field=models.CharField(blank=True, max_length=120, null=True),
        ),
        migrations.AddConstraint(
            model_name="module",
            constraint=models.UniqueConstraint(
                fields=("course", "source_id"), name="unique_course_module_source_id"
            ),
        ),
        migrations.AddConstraint(
            model_name="module",
            constraint=models.UniqueConstraint(fields=("course", "position"), name="unique_course_module_position"),
        ),
        migrations.AddConstraint(
            model_name="draftstep",
            constraint=models.UniqueConstraint(
                condition=models.Q(source_id__isnull=False),
                fields=("course", "source_id"),
                name="unique_course_draft_step_source_id",
            ),
        ),
        migrations.AddConstraint(
            model_name="modulerevision",
            constraint=models.UniqueConstraint(
                fields=("revision", "source_id"), name="unique_revision_module_source_id"
            ),
        ),
        migrations.AddConstraint(
            model_name="modulerevision",
            constraint=models.UniqueConstraint(fields=("revision", "position"), name="unique_revision_module_position"),
        ),
    ]
