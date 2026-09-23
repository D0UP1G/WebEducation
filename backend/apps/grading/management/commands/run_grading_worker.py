import time

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Reserved worker entry point for DEV-3"

    def handle(self, *args, **options):
        self.stdout.write(self.style.WARNING("Grading worker scaffold is running; DEV-3 must add the isolated runner."))
        while True:
            time.sleep(30)

